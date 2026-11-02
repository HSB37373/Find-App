"""찾았대 서버 — index.html 서빙 + 사진 분석 API.

흐름: 입구 검사(크기·형식·호출 횟수) → CLIP 분류(항상, 예비용) → [선택] Cloudflare Workers AI 로
물건 이름·카테고리·설명 생성 → 검증 → 실패하면 CLIP + 템플릿 문장으로 대체.

실행: uvicorn server:app --host 0.0.0.0 --port 6000
앱은 상대경로 'api/analyze' 로 호출한다 (공개 주소의 /<아이디> 접두어는 서버에 전달되지 않음).

Workers AI 를 켜려면 서버를 띄우는 셸에 환경변수를 넣는다 (코드·저장소에 키를 넣지 말 것):
    export CF_ACCOUNT_ID=...   export CF_API_TOKEN=...   [export CF_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct]
(llama-3.2-11b-vision 은 Meta 라이선스 동의 전에는 403 이 난다.)
"""
import base64
import colorsys
import io
import json
import os
import re
import threading
import time
import urllib.request
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from transformers import CLIPModel, CLIPProcessor

BASE = Path(__file__).parent
MODEL_ID = "openai/clip-vit-base-patch32"
MAX_BYTES = 8 * 1024 * 1024  # 업로드 사진 최대 8MB
RATE_LIMIT, RATE_WINDOW = 20, 60  # IP당 60초에 20회
CF_TIMEOUT = 10  # Workers AI 응답 대기 상한(초)
Image.MAX_IMAGE_PIXELS = 50_000_000

# 우리 카테고리 -> 세부 사물 (영어 라벨, 한국어 이름). 세부 라벨 확률을 카테고리별로 합산한다.
LABELS = {
    "전자기기": {"smartphone": "스마트폰", "laptop computer": "노트북", "earbuds": "이어폰", "tablet": "태블릿", "computer mouse": "마우스",
                "keyboard": "키보드", "remote control": "리모컨", "charger": "충전기", "headphones": "헤드폰", "smartwatch": "스마트워치"},
    "가방/지갑": {"backpack": "백팩", "handbag": "핸드백", "wallet": "지갑", "suitcase": "캐리어", "purse": "파우치", "tote bag": "에코백", "card holder": "카드지갑"},
    "의류": {"jacket": "재킷", "hoodie": "후드티", "scarf": "목도리", "hat": "모자", "glove": "장갑", "necktie": "넥타이", "t-shirt": "티셔츠", "shoe": "신발", "sweater": "스웨터"},
    "문구류": {"notebook": "노트", "book": "책", "pen": "펜", "pencil case": "필통", "scissors": "가위", "ruler": "자", "folder": "파일", "textbook": "교재"},
    "스포츠용품": {"ball": "공", "tennis racket": "테니스 라켓", "baseball glove": "야구 글러브", "baseball bat": "야구 방망이", "frisbee": "프리스비",
                "skateboard": "스케이트보드", "sports equipment": "운동용품", "water bottle for gym": "운동용 물통"},
    "기타": {"umbrella": "우산", "cup": "컵", "bottle": "병", "key": "열쇠", "clock": "시계", "vase": "화병", "stuffed toy": "인형", "tumbler": "텀블러", "keychain": "키링"},
}
CATS = list(LABELS)
NAMES = [n for c in CATS for n in LABELS[c]]
KO = {n: ko for c in CATS for n, ko in LABELS[c].items()}
OWNER = torch.tensor([i for i, c in enumerate(CATS) for _ in LABELS[c]])

state = {}
gpu_lock = threading.Lock()
hits = defaultdict(deque)  # IP -> 최근 호출 시각


@asynccontextmanager
async def lifespan(app):
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if dev == "cuda" else torch.float32
    model = CLIPModel.from_pretrained(MODEL_ID, torch_dtype=dtype).to(dev).eval()
    proc = CLIPProcessor.from_pretrained(MODEL_ID)
    with torch.no_grad():
        tin = proc(text=[f"a photo of a {n}" for n in NAMES], return_tensors="pt", padding=True).to(dev)
        tf = model.get_text_features(**tin)
        tf = tf / tf.norm(dim=-1, keepdim=True)
    state.update(model=model, proc=proc, tf=tf, dev=dev, dtype=dtype)
    yield
    state.clear()


app = FastAPI(lifespan=lifespan)


def cf_enabled():
    return bool(os.environ.get("CF_ACCOUNT_ID") and os.environ.get("CF_API_TOKEN"))


@app.get("/")
def index():
    return FileResponse(BASE / "index.html")


@app.get("/api/health")
def health():
    return {"ok": bool(state), "device": state.get("dev"), "model": MODEL_ID, "workers_ai": cf_enabled()}


def check_rate(request: Request):
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or request.client.host
    q, now = hits[ip], time.time()
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(429, "요청이 너무 많아요. 잠시 후 다시 시도해주세요")
    q.append(now)


def clip_classify(img):
    with gpu_lock, torch.no_grad():
        px = state["proc"](images=img, return_tensors="pt")["pixel_values"].to(state["dev"], state["dtype"])
        f = state["model"].get_image_features(pixel_values=px)
        f = f / f.norm(dim=-1, keepdim=True)
        prob = (100 * f @ state["tf"].T).softmax(-1)[0].float().cpu()
    cat_prob = torch.zeros(len(CATS)).index_add_(0, OWNER, prob)
    best = int(cat_prob.argmax())
    return CATS[best], float(cat_prob[best]), NAMES[int(prob.argmax())], {c: round(float(p), 3) for c, p in zip(CATS, cat_prob)}


def dominant_color(img):
    """사진 가운데 영역의 대표 색을 한국어 색 이름으로."""
    w, h = img.size
    c = img.crop((int(w * .2), int(h * .2), int(w * .8), int(h * .8))).resize((40, 40))
    votes = defaultdict(int)
    for r, g, b in c.getdata():
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hd = hh * 360
        if v < 0.2:
            n = "검정색"
        elif s < 0.12:
            n = "흰색" if v > 0.85 else "회색"
        elif hd < 15 or hd >= 345:
            n = "빨간색"
        elif hd < 40:
            n = "갈색" if v < 0.55 else "주황색"
        elif hd < 70:
            n = "노란색"
        elif hd < 170:
            n = "초록색"
        elif hd < 260:
            n = "파란색"
        elif hd < 300:
            n = "보라색"
        else:
            n = "분홍색"
        votes[n] += 1
    return max(votes, key=votes.get)


def template_thing(category, conf, obj_en, color):
    """Workers AI 를 못 쓸 때의 물품명: CLIP 라벨의 한국어 이름 + 대표 색."""
    thing = KO.get(obj_en, "물건") if conf >= 0.5 else f"{category} 물품"
    return f"{color} {thing}"


def workers_ai(img):
    """Cloudflare Workers AI(OpenAI 호환 엔드포인트)로 습득물의 물품명·카테고리·대략적 특징 생성. 실패하면 None."""
    if not cf_enabled():
        return None
    acct, token = os.environ["CF_ACCOUNT_ID"], os.environ["CF_API_TOKEN"]
    model = os.environ.get("CF_MODEL", "@cf/mistralai/mistral-small-3.1-24b-instruct")
    small = img.copy()
    small.thumbnail((768, 768))
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=85)
    data_url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    prompt = (
        "대학교 분실물 게시판에 올릴 습득물 사진이다. 사진 가운데에서 가장 크게 보이는 물건 하나만 보라. "
        "배경이나 주변의 다른 물건은 무시하라. JSON 한 개만 출력하고 다른 말은 쓰지 마라.\n"
        '{"name": "색을 포함한 물건 이름(한국어, 15자 이내, 예: 검정색 백팩)", '
        '"category": "' + "|".join(CATS) + '" 중 하나, '
        '"feature": "대략적인 특징 한 가지를 짧은 합쇼체 한 문장으로(예: 앞주머니에 작은 키링이 달려 있습니다.), 없으면 빈 문자열"}\n'
        "규칙: 사진에서 확실히 보이는 것만 써라. 추측하지 마라. 없는 것(예: 흠집이 없다)은 쓰지 마라. "
        "주인 확인에 쓸 결정적 특징(이름·학번·번호·글자 내용·안에 든 물건)과 개인정보는 절대 쓰지 마라."
    )
    body = json.dumps({
        "model": model, "max_tokens": 200, "temperature": 0.2,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]}],
    }).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=CF_TIMEOUT) as r:
            text = json.load(r)["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", text, re.S)
        j = json.loads(m.group(0))
        name = str(j.get("name", "")).strip()[:20]
        feat = str(j.get("feature", "")).strip()[:80]
        cat = str(j.get("category", "")).strip()
        if not name:
            return None
        if feat and not feat.endswith((".", "!", "?")):
            feat += "."
        return {"name": name, "feature": feat, "category": cat if cat in CATS else None}
    except Exception as e:  # 시간 초과·한도 초과·형식 오류 모두 대체 경로로
        print("workers_ai 실패:", type(e).__name__, str(e)[:120])
        return None


@app.post("/api/analyze")
def analyze(request: Request, file: UploadFile = File(...), kind: str = Form("found")):
    """습득물(found): 카테고리 + 물품명(thing)·대략적 특징(feature) — 설명 문장은 앱이 날짜·시간대·장소와 합쳐 만든다.
    분실물(lost): 카테고리만 (Workers AI 를 호출하지 않는다)."""
    check_rate(request)
    kind = "lost" if kind == "lost" else "found"
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "사진이 너무 큽니다 (최대 8MB)")
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "이미지 파일을 읽을 수 없습니다")

    clip_cat, conf, obj, scores = clip_classify(img)  # 예비용으로 항상 실행
    out = {
        "kind": kind, "category": clip_cat, "confidence": round(conf, 3), "clip_category": clip_cat,
        "agree": True, "source": "clip", "scores": {c: round(p, 3) for c, p in scores.items()},
    }
    if kind == "lost":
        return out

    thing, feature, out["source"] = template_thing(clip_cat, conf, obj, dominant_color(img)), "", "template"
    ai = workers_ai(img)
    if ai:
        thing, feature, out["source"] = ai["name"], ai["feature"], "workers-ai"
        if ai["category"]:
            out["category"] = ai["category"]
            # CLIP이 확신하는데 판단이 다르면 사용자에게 확인을 요청한다 (배경 물건을 잡는 경우 등)
            out["agree"] = not (conf >= 0.8 and clip_cat != ai["category"])
    out.update(thing=thing, feature=feature, name=f"{thing} 습득")
    return out
