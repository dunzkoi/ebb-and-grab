#!/usr/bin/env python3
"""
.gltf(JSON + base64 내장) → .glb(단일 이진 청크) 무손실 변환.

정점 데이터는 바이트 단위로 그대로 옮긴다. 양자화나 재압축을 하지 않으므로
렌더 결과가 픽셀 단위로 동일하다. 얻는 것은 base64 디코드 제거와
쪼개진 버퍼 수백 개의 병합이다.

사용: python3 tools/gltf2glb.py assets/models
"""
import base64
import json
import os
import struct
import sys


def pad4(n):
    return (4 - n % 4) % 4


def convert(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)

    blob = bytearray()
    offsets = []
    for b in d.get("buffers", []):
        uri = b.get("uri", "")
        if uri.startswith("data:"):
            raw = base64.b64decode(uri.split(",", 1)[1])
        elif uri:
            with open(os.path.join(os.path.dirname(path), uri), "rb") as bf:
                raw = bf.read()
        else:
            raise SystemExit(f"{path}: GLB 청크 버퍼는 지원하지 않음")
        offsets.append(len(blob))
        blob += raw
        blob += b"\x00" * pad4(len(blob))

    for bv in d.get("bufferViews", []):
        bv["byteOffset"] = offsets[bv.get("buffer", 0)] + bv.get("byteOffset", 0)
        bv["buffer"] = 0

    d["buffers"] = [{"byteLength": len(blob)}]

    js = json.dumps(d, separators=(",", ":")).encode("utf-8")
    js += b" " * pad4(len(js))
    blob += b"\x00" * pad4(len(blob))

    total = 12 + 8 + len(js) + 8 + len(blob)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)

    dst = os.path.splitext(path)[0] + ".glb"
    with open(dst, "wb") as f:
        f.write(out)
    return os.path.getsize(path), len(out), len(offsets)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "assets/models"
    src_total = dst_total = 0
    for name in sorted(os.listdir(root)):
        if not name.endswith(".gltf"):
            continue
        s, t, nbuf = convert(os.path.join(root, name))
        src_total += s
        dst_total += t
        print(f"  {name:24s} {s//1024:5d}KB → {t//1024:5d}KB  (버퍼 {nbuf}개 병합)")
    print(f"합계 {src_total//1024}KB → {dst_total//1024}KB "
          f"({100 - dst_total * 100 // src_total}% 감소)")


if __name__ == "__main__":
    main()
