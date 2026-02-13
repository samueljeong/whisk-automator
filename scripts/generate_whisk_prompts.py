#!/usr/bin/env python3
"""
scenes.json → Whisk 프롬프트 텍스트 생성.

캐릭터 도감(CHARACTER_MAP)에 없는 인물이 반복 등장하면 경고를 출력하고,
등록된 캐릭터만 [캐릭터] 태그를 포함한 프롬프트를 생성합니다.

사용법:
    python scripts/generate_whisk_prompts.py 20
    python scripts/generate_whisk_prompts.py 20 --open
    python scripts/generate_whisk_prompts.py 20 --threshold 5
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

# convert_characters.py에서 메타데이터 import
sys.path.insert(0, str(Path(__file__).parent))
from convert_characters import CHARACTER_META

# 경로 설정
FACTORY_BASE = Path.home() / "Projects/코딩/youtube-factory"
SCENES_BASE = FACTORY_BASE / "outputs/yonga"
OUTPUT_BASE = FACTORY_BASE / "outputs/whisk/yonga"

# "배경" 등 캐릭터가 아닌 subject 값
NON_CHARACTER_SUBJECTS = {"배경", "background", "전경", "원경", "경맥 내부", "일행"}

# 프롬프트 텍스트 → 캐릭터 매핑 (영문 묘사 힌트)
# 프롬프트에서 2인 장면의 동반 캐릭터를 텍스트로 추정
PROMPT_CHARACTER_HINTS = {
    "tall swordsman": "철무영",
    "tall stern swordsman": "철무영",
    "stern swordsman": "철무영",
    "swordsman loading rope": "철무영",
    "swordsman drawing sword": "철무영",
    "swordsman polishing blade": "철무영",
    "swordsman standing": "철무영",
    "swordsman gesturing": "철무영",
    "young man with golden": "용아",
    "golden-eyed man": "용아",
    "golden dragon eyes": "용아",
    "young golden-eyed": "용아",
    "young man joining": "용아",
    "young man's": "용아",
    "young warrior": "용아",
    "old martial artist": "취광도인",
    "old drunkard": "취광도인",
    "wine bottle": "취광도인",
    "eccentric old": "취광도인",
    "ornate robes clasping": "취광도인",
    "small girl": "소소",
    "small cheerful girl": "소소",
    "small sleepy girl": "소소",
    "woman in white": "소연",
    "swordswoman": "소연",
    "white martial arts robes": "소연",
    "woman in purple": "독련",
    "purple robes": "독련",
    "beautiful woman": "독련",
}

# 2인 이상 장면을 감지하는 키워드
MULTI_PERSON_KEYWORDS = [
    "two silhouettes", "two figures", "two martial artists", "two warriors",
    "two people", "two men", "two women", "two characters",
    "both faces", "both swords", "both looking",
    "shoulder to shoulder", "side by side", "back to back",
    "joining him", "joining her",
    "approaching young man", "approaching the woman",
    "companion who", "companion as",
    "speaking to companion",
    "clasping hands with",
    "standing shoulder",
]

# mood → 캐릭터 표정/행동 보강 표현
# Whisk이 기본 표정(웃는 얼굴)으로 그리는 걸 방지
MOOD_EXPRESSIONS = {
    "tense": "tense expression, clenched jaw, sharp vigilant eyes, body coiled ready to move",
    "dark": "grim expression, shadowed face, heavy brows, haunted eyes",
    "determined": "steely determined gaze, firm set mouth, unwavering eyes, squared shoulders",
    "calm": "serene calm expression, relaxed posture, steady breathing, gentle eyes",
    "focused": "intensely focused expression, narrowed eyes, furrowed brows, deep concentration",
    "pain": "grimacing in agony, teeth clenched, veins visible, trembling body",
    "hopeful": "eyes widening with cautious hope, slight relieved exhale, trembling smile",
    "powerful": "confident powerful stance, commanding presence, blazing eyes",
    "angry": "furious snarling expression, bared teeth, burning rage in eyes, aggressive stance",
    "sad": "sorrowful downcast eyes, trembling lips, tears welling, slumped shoulders",
    "shocked": "wide-eyed shock, mouth agape, frozen in disbelief, pale face",
    "fearful": "terrified wide eyes, trembling, backing away, cold sweat on face",
    "relieved": "deep exhale of relief, shoulders dropping, eyes closing briefly, weary smile",
    "urgent": "desperate urgency, running, looking back anxiously, sweat dripping, frantic movement",
    "cold": "cold emotionless stare, stone-faced, icy detachment, rigid posture",
    "fierce": "fierce battle cry, wild eyes, teeth bared, aggressive forward lean",
    "gentle": "soft gentle expression, warm caring eyes, tender careful hands",
    "mysterious": "enigmatic half-smile, unreadable eyes, composed stillness",
    "proud": "chin raised with pride, chest out, confident satisfied expression",
    "desperate": "desperate anguished face, reaching out frantically, veins bulging, screaming",
    "mocking": "contemptuous smirk, raised eyebrow, arrogant tilt of head",
    "solemn": "solemn grave expression, lowered head, respectful stillness, heavy atmosphere",
    "surprise": "eyebrows shooting up, mouth open, body jolting back in surprise",
    "resolve": "jaw set with iron resolve, burning determination in eyes, fists clenched tight",
}

# CHARACTER_MAP에서 한글명 + aliases 집합 생성
REGISTERED_NAMES: set[str] = set()
for _key, (_name, _filename, _aliases, _desc) in CHARACTER_MAP.items():
    REGISTERED_NAMES.add(_name)
    REGISTERED_NAMES.update(_aliases)

# prompt_ko 스캔용: 긴 이름 우선 정렬 (부분 문자열 매칭 방지)
# "철무영"이 "무영"보다 먼저 매칭되도록
REGISTERED_NAMES_SORTED = sorted(REGISTERED_NAMES, key=len, reverse=True)


def load_scenes(episode: int) -> dict:
    """에피소드 scenes.json 로드."""
    scenes_path = SCENES_BASE / f"episode_{episode}" / "scenes.json"
    if not scenes_path.exists():
        print(f"ERROR: 파일 없음 → {scenes_path}", file=sys.stderr)
        sys.exit(1)
    with open(scenes_path, encoding="utf-8") as f:
        return json.load(f)


def analyze_characters(scenes: list[dict]) -> Counter:
    """subject 필드에서 캐릭터 등장 횟수 집계 (배경 제외, 콤마/+/& 분리)."""
    subjects = Counter()
    for scene in scenes:
        subject = scene.get("subject", "").strip()
        if subject and subject not in NON_CHARACTER_SUBJECTS:
            names = [n.strip() for n in subject.replace("+", ",").replace("&", ",").split(",")]
            for name in names:
                if name:
                    subjects[name] += 1
    return subjects


def classify_characters(
    subject_counts: Counter, threshold: int
) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    """캐릭터를 등록/미등록반복/엑스트라로 분류."""
    registered = {}
    unregistered_frequent = {}
    extras = {}

    for name, count in subject_counts.most_common():
        if name in REGISTERED_NAMES:
            registered[name] = count
        elif count >= threshold:
            unregistered_frequent[name] = count
        else:
            extras[name] = count

    return registered, unregistered_frequent, extras


def print_analysis(
    total_scenes: int,
    registered: dict[str, int],
    unregistered_frequent: dict[str, int],
    extras: dict[str, int],
    threshold: int,
):
    """캐릭터 등장 분석 결과 출력."""
    print(f"\n캐릭터 등장 분석:")

    # 등록 캐릭터
    for name, count in sorted(registered.items(), key=lambda x: -x[1]):
        print(f"  ✅ {name}: {count}회 (등록)")

    # 미등록 반복
    for name, count in sorted(unregistered_frequent.items(), key=lambda x: -x[1]):
        print(f"  ⚠️  {name}: {count}회 (미등록 - 도감 추가 필요!)")

    # 엑스트라
    for name, count in sorted(extras.items(), key=lambda x: -x[1]):
        print(f"  ⏭️  {name}: {count}회 (엑스트라, 태그 생략)")

    # 미등록 반복 경고
    if unregistered_frequent:
        print(f"\n⚠️  미등록 반복 캐릭터 ({threshold}회 이상):")
        for name, count in sorted(
            unregistered_frequent.items(), key=lambda x: -x[1]
        ):
            print(f"  → {name} ({count}회) - 캐릭터 도감에 추가 후 다시 실행 권장")


def enrich_with_mood(prompt: str, mood: str, subject: str) -> str:
    """캐릭터 씬에 mood 기반 표정/행동 묘사 보강.

    배경 씬이거나 이미 표정 묘사가 충분하면 원본 유지.
    """
    if not mood or subject in NON_CHARACTER_SUBJECTS or not subject:
        return prompt

    expression = MOOD_EXPRESSIONS.get(mood)
    if not expression:
        return prompt

    # 이미 표정/감정 키워드가 포함되어 있으면 스킵
    emotion_keywords = [
        "expression", "grimac", "clenched", "tearful", "furious",
        "terrified", "desperate", "snarl", "smirk", "trembling",
        "screaming", "crying", "sobbing", "weeping", "gritting",
    ]
    prompt_lower = prompt.lower()
    if any(kw in prompt_lower for kw in emotion_keywords):
        return prompt

    # 프롬프트 끝에 감정 표현 추가
    return f"{prompt}, {expression}"


def detect_multi_person(prompt: str) -> bool:
    """프롬프트에서 2인 이상 장면인지 감지."""
    prompt_lower = prompt.lower()
    return any(kw in prompt_lower for kw in MULTI_PERSON_KEYWORDS)


def detect_characters_from_prompt(prompt: str, exclude: str = "", prompt_ko: str = "") -> list[str]:
    """프롬프트에서 캐릭터 추정. 우선순위:
    1. prompt_ko에서 한글 등록 캐릭터명 직접 매칭
    2. prompt(영문)에서 묘사 힌트 매칭
    """
    found = []

    # 1단계: prompt_ko에서 한글 캐릭터명 직접 검색 (긴 이름 우선)
    if prompt_ko:
        remaining = prompt_ko
        # exclude 대상 이름을 먼저 제거 (부분 문자열 매칭 방지)
        if exclude:
            remaining = remaining.replace(exclude, "")
        for name in REGISTERED_NAMES_SORTED:
            if name in remaining and name != exclude and name not in found:
                found.append(name)
                remaining = remaining.replace(name, "")
        if found:
            return found

    # 2단계: 영문 프롬프트에서 묘사 힌트 매칭
    prompt_lower = prompt.lower()
    for hint, char_name in PROMPT_CHARACTER_HINTS.items():
        if hint in prompt_lower and char_name != exclude and char_name not in found:
            found.append(char_name)
    return found


def find_companion(
    scene_idx: int,
    scenes: list[dict],
    primary_subject: str,
) -> Optional[str]:
    """동반 캐릭터 추정. 우선순위:
    1. 프롬프트 텍스트에서 캐릭터 묘사 힌트 감지
    2. 인접 씬 거리 가중치 + 같은 섹션 보너스 (폴백)
    """
    prompt = scenes[scene_idx].get("prompt", "")
    prompt_ko = scenes[scene_idx].get("prompt_ko", "")

    # 1단계: 프롬프트 텍스트에서 직접 캐릭터 추정
    text_chars = detect_characters_from_prompt(prompt, exclude=primary_subject, prompt_ko=prompt_ko)
    if text_chars:
        return text_chars[0]

    # 2단계: 인접 씬 거리 가중치 (폴백)
    section = scenes[scene_idx].get("section", "")
    scores: dict[str, float] = {}

    for offset in range(-10, 11):
        if offset == 0:
            continue
        idx = scene_idx + offset
        if 0 <= idx < len(scenes):
            sub = scenes[idx].get("subject", "").strip()
            same_section = scenes[idx].get("section", "") == section
            for n in sub.replace("+", ",").replace("&", ",").split(","):
                n = n.strip()
                if (
                    n
                    and n in REGISTERED_NAMES
                    and n != primary_subject
                    and n not in NON_CHARACTER_SUBJECTS
                ):
                    weight = 1.0 / abs(offset)
                    if same_section:
                        weight *= 3
                    scores[n] = scores.get(n, 0) + weight

    if scores:
        best = max(scores, key=scores.get)
        return best
    return None


def generate_prompt_line(
    scene: dict,
    scene_idx: int,
    scenes: list[dict],
    unregistered_frequent: dict[str, int],
) -> str:
    """씬 하나에 대한 프롬프트 라인 생성."""
    filename = scene.get("filename", "unknown.png")
    prompt = scene.get("prompt", "")
    subject = scene.get("subject", "").strip()
    mood = scene.get("mood", "").strip()

    # 캐릭터 씬이면 mood 기반 표정/행동 보강
    prompt = enrich_with_mood(prompt, mood, subject)

    # 캐릭터 태그 결정 (다중 인물: [용아] [염창] 개별 태그, 최대 3인)
    tag = ""
    if subject and subject not in NON_CHARACTER_SUBJECTS:
        names = [n.strip() for n in subject.replace("+", ",").replace("&", ",").split(",")]

        # 2인 장면 감지: subject에 1명인데 프롬프트에 2인 이상 키워드 있으면 동반자 추가
        if len(names) == 1 and detect_multi_person(prompt):
            companion = find_companion(scene_idx, scenes, names[0])
            if companion:
                names.append(companion)
                print(f"  🔗 {filename}: 2인 장면 감지 → [{names[0]}] + [{companion}] 자동 태그")

        # subject가 비어있지만(배경) 2인 키워드 있으면 인접 씬에서 캐릭터 2명 추정
        tags = []
        for name in names[:3]:  # Whisk 피사체 슬롯 최대 3개
            if name in REGISTERED_NAMES or name in unregistered_frequent:
                tags.append(f"[{name}]")
        if len(names) > 3:
            skipped = [n.strip() for n in names[3:]]
            print(f"  ⚠️  {filename}: 인물 {len(names)}명 → 3명 제한, 제외: {', '.join(skipped)}")
        if tags:
            tag = " ".join(tags) + " "
    elif (not subject or subject in NON_CHARACTER_SUBJECTS) and detect_multi_person(prompt):
        # 배경 씬인데 2인 키워드 → 텍스트 힌트 우선, 인접 씬 폴백
        prompt_ko = scene.get("prompt_ko", "")
        text_chars = detect_characters_from_prompt(prompt, prompt_ko=prompt_ko)
        if len(text_chars) >= 2:
            top_two = text_chars[:2]
        else:
            section = scene.get("section", "")
            scores: dict[str, float] = {}
            for offset in range(-10, 11):
                if offset == 0:
                    continue
                idx = scene_idx + offset
                if 0 <= idx < len(scenes):
                    sub = scenes[idx].get("subject", "").strip()
                    same_section = scenes[idx].get("section", "") == section
                    for n in sub.replace("+", ",").replace("&", ",").split(","):
                        n = n.strip()
                        if n and n in REGISTERED_NAMES and n not in NON_CHARACTER_SUBJECTS:
                            weight = 1.0 / abs(offset)
                            if same_section:
                                weight *= 3
                            scores[n] = scores.get(n, 0) + weight
            # 텍스트에서 1명 찾았으면 그거 + 인접 최고점
            if text_chars:
                scores.pop(text_chars[0], None)
                best_nearby = max(scores, key=scores.get) if scores else None
                top_two = text_chars + ([best_nearby] if best_nearby else [])
            else:
                top_two = sorted(scores, key=scores.get, reverse=True)[:2]
        if top_two:
            tag = " ".join(f"[{n}]" for n in top_two) + " "
            print(f"  🔗 {filename}: 배경+2인 감지 → {' '.join(f'[{n}]' for n in top_two)} 자동 태그")

    # 장면 유형별 시각 스타일 키워드 보강
    shot_type = scene.get("shot_type", "").lower()
    style_boost = ""
    if any(kw in prompt.lower() for kw in ["action", "slash", "clash", "fight", "sword", "attack", "dodge", "leap", "kick", "block"]):
        style_boost = ", speed lines, ink splash effects, motion blur streaks, explosive impact"
    elif any(kw in prompt.lower() for kw in ["close-up", "extreme close", "face", "eyes", "portrait"]):
        style_boost = ", sharp detailed linework, dramatic chiaroscuro lighting, intense eye detail"
    elif any(kw in prompt.lower() for kw in ["wide shot", "panoram", "landscape", "vista", "overhead", "bird"]):
        style_boost = ", sweeping ink wash background, atmospheric perspective, layered depth"
    elif any(kw in prompt.lower() for kw in ["dragon", "energy", "fire", "glow", "aura", "meridian", "poison"]):
        style_boost = ", glowing energy effects, supernatural color contrast, ethereal particle effects"

    return f"[filename:{filename}] {tag}{prompt}{style_boost}. No text."


def generate_prompts(
    scenes: list[dict], unregistered_frequent: dict[str, int]
) -> str:
    """전체 프롬프트 텍스트 생성."""
    lines = []
    for idx, scene in enumerate(scenes):
        lines.append(generate_prompt_line(scene, idx, scenes, unregistered_frequent))
    return "\n\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="scenes.json → Whisk 프롬프트 생성"
    )
    parser.add_argument("episode", type=int, help="에피소드 번호")
    parser.add_argument(
        "--open", action="store_true", help="생성 후 TextEdit으로 열기"
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=3,
        help="미등록 반복 캐릭터 경고 기준 (기본: 3회)",
    )
    args = parser.parse_args()

    # scenes.json 로드
    data = load_scenes(args.episode)
    scenes = data.get("scenes", [])
    title = data.get("title", "")

    print(f"에피소드 {args.episode}: {len(scenes)}개 씬")
    if title:
        print(f"제목: {title}")

    # 캐릭터 분석
    subject_counts = analyze_characters(scenes)
    registered, unregistered_frequent, extras = classify_characters(
        subject_counts, args.threshold
    )
    print_analysis(len(scenes), registered, unregistered_frequent, extras, args.threshold)

    # 프롬프트 생성
    prompt_text = generate_prompts(scenes, unregistered_frequent)

    # 출력 파일 저장
    output_dir = OUTPUT_BASE
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"ep{args.episode}_whisk_prompts.txt"
    output_path.write_text(prompt_text, encoding="utf-8")

    print(f"\n✅ {output_path.name} 생성 완료 ({len(scenes)}개 씬)")
    print(f"   → {output_path}")

    # --open 플래그 처리
    if args.open:
        subprocess.run(["open", "-a", "TextEdit", str(output_path)])
        print("   → TextEdit에서 열었습니다")


if __name__ == "__main__":
    main()
