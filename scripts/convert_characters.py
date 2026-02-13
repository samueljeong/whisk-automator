#!/usr/bin/env python3
"""
캐릭터/장면/스타일 이미지를 Base64 data URL로 변환하여 characters_base64.js 생성.

폴더에 이미지를 넣으면 자동 인식됨 (파일명 = 캐릭터명).
예: 용아.png → 캐릭터 "용아"로 등록

사용법:
    python scripts/convert_characters.py
    python scripts/convert_characters.py --characters-dir /path/to/chars
    python scripts/convert_characters.py --output popup/characters_base64.js
"""

import argparse
import base64
import json
import sys
from pathlib import Path
from typing import Optional

WHISK_BASE = Path.home() / "Projects/코딩/youtube-factory/outputs/whisk"

# 기본 디렉토리
DEFAULT_CHARACTERS_DIR = WHISK_BASE / "yonga" / "characters"
SCENES_DIR = WHISK_BASE / "yonga" / "scenes"
STYLES_DIR = WHISK_BASE / "yonga" / "styles"

# 스타일 레퍼런스 이미지 (Whisk 스타일 슬롯용)
STYLE_REFERENCE = STYLES_DIR / "style_ref_v3.png"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# 선택적 메타데이터: 캐릭터명 → (별명들, 설명)
# 여기에 없어도 폴더의 이미지는 자동 인식됨
CHARACTER_META = {
    "용아": (["용아", "yonga", "龍兒"], "20대 청년, 검은 단발, 금색 세로동공, 무협 복장"),
    "소소": (["소소", "soso"], "어린 아이"),
    "취광도인": (["취광도인", "스승", "master", "취광"], "중년 도인, 술병, 도복"),
    "소연": (["소연", "soyeon"], "20세 여성, 단발 보브컷, 화산파 제복, 검"),
    "염창": (["염창", "yeomchang"], "마교 사천왕, 붉은 갑옷, 적염창, 화기 사용"),
    "철무영": (["철무영", "cheolmuyeong", "무영"], "넓은 어깨, 검객, 묵직한 체격"),
    "독련": (["독련", "dogryeon"], "독을 사용하는 무인"),
    "뇌황": (["뇌황", "noehwang"], "번개 기술 사용자"),
    "흑염교주": (["흑염교주", "heukyeom", "교주"], "마교 교주, 흑염 사용"),
    "암영": (["암영", "amyeong"], "암살 전문 무인"),
    "당천로": (["당천로", "dangcheonro"], "당가 원로, 인자한 할아버지"),
    "당무결": (["당무결", "dangmugyeol"], "당가 소가주, 의리 있는 해독 전문가"),
    "당소화": (["당소화", "dangsohwa"], "당무결의 여동생, 활발한 해독 천재"),
    "석이": (["석이", "seoki"], "7-8세 소년, 짧은 검은 머리, 갈색 한복, 마른 체형"),
    "독랑": (["독랑", "doglang"], "독련의 추적자, 야수적 사냥꾼"),
    "혈영": (["혈영", "hyeolyeong"], "독련의 심복, 잔인한 암살자"),
    "제갈휘": (["제갈휘", "jegalhwi"], "제갈세가 가주, 온화한 학자"),
    "제갈명": (["제갈명", "jegalmyeong"], "제갈세가 젊은 책사, 냉철하지만 정의로움"),
}

# 장면 매핑 (이미지 없어도 등록 가능)
SCENE_MAP = {
    "murimmaeng": ("무림맹", None, ["무림맹", "murimmaeng"], "무림맹 본산"),
    "master_house": ("스승의집", None, ["스승의집", "취광도인집", "사부집"], "취광도인의 거처"),
    "dark_alley": ("암흑가", None, ["암흑가", "암흑거리"], "암흑가 뒷골목"),
    "dangga": ("당가", None, ["당가", "사천당가"], "사천당가 본산"),
    "cliff": ("절벽", None, ["절벽", "낭떠러지"], "높은 절벽/낭떠러지"),
    "inn": ("객잔", None, ["객잔", "주막"], "무림 객잔/주막"),
}


def image_to_base64(filepath: Path) -> Optional[str]:
    """이미지 파일을 Base64 data URL로 변환."""
    if not filepath.exists():
        print(f"  [SKIP] 파일 없음: {filepath.name}", file=sys.stderr)
        return None

    with open(filepath, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")

    suffix = filepath.suffix.lower()
    mime_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    mime = mime_types.get(suffix, "image/png")

    return f"data:{mime};base64,{data}"


def scan_characters(characters_dir: Path) -> dict:
    """폴더를 스캔하여 이미지 파일을 자동 인식 → Base64 변환."""
    result = {}

    # 폴더 내 이미지 파일 스캔 (하위 폴더, _backup 제외)
    image_files = sorted(
        f for f in characters_dir.iterdir()
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not image_files:
        print("  이미지 파일 없음", file=sys.stderr)
        return result

    for filepath in image_files:
        name = filepath.stem  # 파일명(확장자 제외) = 캐릭터명
        print(f"  [{name}] {filepath.name}", end=" ... ")

        data_url = image_to_base64(filepath)
        if not data_url:
            print("SKIP")
            continue

        size_kb = len(data_url) // 1024
        print(f"OK ({size_kb}KB)")

        # 메타데이터 있으면 사용, 없으면 기본값
        if name in CHARACTER_META:
            aliases, description = CHARACTER_META[name]
        else:
            aliases = [name]
            description = ""

        result[name] = {
            "name": name,
            "aliases": aliases,
            "image": data_url,
            "description": description,
        }

    return result


def convert_scenes() -> dict:
    """장면 이미지를 Base64로 변환. 이미지 없으면 빈 문자열."""
    result = {}

    # SCENE_MAP에 등록된 장면
    for key, (name, filename, aliases, description) in SCENE_MAP.items():
        data_url = ""
        if filename:
            filepath = SCENES_DIR / filename
            print(f"  [장면:{key}] {name}: {filename}", end=" ... ")
            data_url = image_to_base64(filepath) or ""
            if data_url:
                size_kb = len(data_url) // 1024
                print(f"OK ({size_kb}KB)")
            else:
                print("SKIP (이미지 없음, 빈 슬롯)")
        else:
            print(f"  [장면:{key}] {name}: (이미지 미등록)")

        result[key] = {
            "name": name,
            "aliases": aliases,
            "image": data_url,
            "description": description,
        }

    # scenes 폴더에 있는 추가 이미지도 자동 인식
    if SCENES_DIR.exists():
        registered_files = {v[1] for v in SCENE_MAP.values() if v[1]}
        for filepath in sorted(SCENES_DIR.iterdir()):
            if filepath.is_file() and filepath.suffix.lower() in IMAGE_EXTENSIONS and filepath.name not in registered_files:
                name = filepath.stem
                print(f"  [장면:auto] {name}: {filepath.name}", end=" ... ")
                data_url = image_to_base64(filepath) or ""
                if data_url:
                    size_kb = len(data_url) // 1024
                    print(f"OK ({size_kb}KB)")
                    result[name] = {
                        "name": name,
                        "aliases": [name],
                        "image": data_url,
                        "description": "",
                    }

    return result


def generate_js_module(characters: dict, scenes: dict, style_image: str, output_path: Path):
    """JavaScript 모듈로 출력 (popup.js에서 import 가능)."""
    lines = ["// Auto-generated by convert_characters.py", "// DO NOT EDIT MANUALLY", ""]

    # 스타일 레퍼런스
    lines.append(f'const STYLE_REFERENCE_BASE64 = "{style_image}";')
    lines.append("")

    lines.append("const CHARACTER_BASE64 = {")

    # 캐릭터
    for key, data in characters.items():
        name = data["name"]
        aliases_str = json.dumps(data["aliases"], ensure_ascii=False)
        desc = data["description"]
        lines.append(f'  "{name}": {{')
        lines.append(f'    image: "{data["image"]}",')
        lines.append(f"    aliases: {aliases_str},")
        lines.append(f'    description: "{desc}"')
        lines.append("  },")

    # 장면
    if scenes:
        lines.append("")
        lines.append("  // === 장면 (Scene) ===")
        lines.append('  // type: "scene" 으로 캐릭터와 구분')
        for key, data in scenes.items():
            name = data["name"]
            aliases_str = json.dumps(data["aliases"], ensure_ascii=False)
            desc = data["description"]
            image = data["image"]
            lines.append(f'  "{name}": {{')
            lines.append(f'    image: "{image}",')
            lines.append(f"    aliases: {aliases_str},")
            lines.append(f'    type: "scene",')
            lines.append(f'    description: "{desc}"')
            lines.append("  },")

    lines.append("};")
    lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n  JS 파일 생성: {output_path} ({size_mb:.1f}MB)")


def generate_json(characters: dict, output_path: Path):
    """JSON 파일로 출력."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(characters, ensure_ascii=False, indent=2), encoding="utf-8")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n  JSON 파일 생성: {output_path} ({size_mb:.1f}MB)")


def main():
    parser = argparse.ArgumentParser(description="캐릭터 이미지 Base64 변환")
    parser.add_argument("--output", "-o", default="popup/characters_base64.js",
                        help="출력 파일 경로 (기본: popup/characters_base64.js)")
    parser.add_argument("--characters-dir", "-c", default=None,
                        help=f"캐릭터 이미지 폴더 (기본: {DEFAULT_CHARACTERS_DIR})")
    parser.add_argument("--json", action="store_true",
                        help="JSON 형식으로도 출력")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent
    output_path = project_root / args.output
    characters_dir = Path(args.characters_dir) if args.characters_dir else DEFAULT_CHARACTERS_DIR

    print(f"캐릭터 이미지 디렉토리: {characters_dir}")
    print(f"출력 파일: {output_path}\n")

    if not characters_dir.exists():
        print(f"ERROR: 디렉토리가 존재하지 않습니다: {characters_dir}", file=sys.stderr)
        sys.exit(1)

    characters = scan_characters(characters_dir)

    if not characters:
        print("\nERROR: 변환된 캐릭터가 없습니다.", file=sys.stderr)
        sys.exit(1)

    print(f"\n총 {len(characters)}개 캐릭터 변환 완료")

    # 장면 변환
    print(f"\n장면 이미지 디렉토리: {SCENES_DIR}")
    scenes = convert_scenes()
    print(f"총 {len(scenes)}개 장면 등록 완료")

    # 스타일 레퍼런스 변환
    style_image = ""
    print(f"\n스타일 레퍼런스: {STYLE_REFERENCE}")
    if STYLE_REFERENCE.exists():
        style_image = image_to_base64(STYLE_REFERENCE) or ""
        if style_image:
            size_kb = len(style_image) // 1024
            print(f"  OK ({size_kb}KB)")
        else:
            print("  SKIP")
    else:
        print("  파일 없음, 건너뜀")

    generate_js_module(characters, scenes, style_image, output_path)

    if args.json:
        json_path = output_path.with_suffix(".json")
        generate_json(characters, json_path)

    # characters.json도 업데이트 (Base64 이미지 포함)
    chars_json_path = project_root / "characters.json"
    generate_json(characters, chars_json_path)
    print(f"  characters.json 업데이트 완료")


if __name__ == "__main__":
    main()
