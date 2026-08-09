#!/usr/bin/env python3
"""
게임에 실제로 나오는 글자만 담은 웹폰트를 받아 assets/fonts/에 저장한다.

한글 웹폰트는 전체를 받으면 2~4MB지만, 이 게임은 화면에 뜨는 글자가 고정이라
쓰는 글자만 추리면 수십 KB로 끝난다. 구글 폰트의 text= 파라미터가 정확히
그 서브셋을 만들어 준다.

사용: python3 tools/subset-fonts.py
"""
import os
import re
import sys
import urllib.request

FONTS = {
    # 파일명: (구글 폰트 family, 굵기)
    "BlackHanSans": "Black+Han+Sans",
    "Jua": "Jua",
}

# 소스에서 글자를 긁어올 파일들
SOURCES = ["index.html", "src/ui.js", "src/game.js", "src/config.js", "src/main.js"]

# 화면에 나오지만 소스 문자열로 안 잡히는 것들 (숫자 조합, 기호)
EXTRA = "0123456789,.%/×→←↑↓●○:()!?+- " \
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz&"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def collect_chars():
    chars = set(EXTRA)
    for path in SOURCES:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for ch in text:
            # 한글 음절과 자모만 수집한다. 라틴은 EXTRA로 충분하다
            if "\uac00" <= ch <= "\ud7a3" or "\u3131" <= ch <= "\u318e":
                chars.add(ch)
    return "".join(sorted(chars))


def fetch(family, text, out_path):
    q = urllib.parse.quote(text, safe="")
    css_url = f"https://fonts.googleapis.com/css2?family={family}&text={q}"
    req = urllib.request.Request(css_url, headers={"User-Agent": UA})
    css = urllib.request.urlopen(req).read().decode("utf-8")
    m = re.search(r"url\((https://[^)]+)\)", css)
    if not m:
        raise SystemExit(f"{family}: woff2 주소를 못 찾음\n{css[:400]}")
    data = urllib.request.urlopen(
        urllib.request.Request(m.group(1), headers={"User-Agent": UA})).read()
    with open(out_path, "wb") as f:
        f.write(data)
    return len(data)


def main():
    text = collect_chars()
    hangul = sum(1 for c in text if "\uac00" <= c <= "\ud7a3")
    print(f"수집한 글자 {len(text)}자 (한글 음절 {hangul}자)")

    os.makedirs("assets/fonts", exist_ok=True)
    total = 0
    for name, family in FONTS.items():
        path = f"assets/fonts/{name}.woff2"
        size = fetch(family, text, path)
        total += size
        print(f"  {name:14s} {size / 1024:6.1f}KB  →  {path}")
    print(f"합계 {total / 1024:.1f}KB")


if __name__ == "__main__":
    sys.exit(main())
