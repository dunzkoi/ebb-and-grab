# 도구

## gltf2glb.py

`.gltf`(JSON + base64 내장)를 `.glb`(단일 이진 청크)로 무손실 변환합니다.
정점 데이터를 바이트 그대로 옮기므로 렌더 결과가 픽셀 단위로 같습니다.

```bash
python3 tools/gltf2glb.py assets/models
```

## capture.js

그래픽 회귀 검증용 결정론적 캡처입니다. 페이지에서 실행하면 게임 루프를 멈추고
동적 객체를 숨긴 뒤 고정 카메라 7개 자세로 렌더해 PNG를 돌려줍니다.

```js
const src = await (await fetch('/tools/capture.js')).text(); (0, eval)(src);
const shots = await window.__capture();   // [{ name, data }]
const stats = window.__stats();           // 씬·메모리 통계
```

최적화 전후로 찍어서 비교합니다. 같은 코드로 두 번 찍었을 때 PSNR 65~99dB가
나오므로, 60dB 이상이면 동일로 봅니다.

```bash
ffmpeg -i before.png -i after.png -lavfi psnr -f null -
```

## coiserve.py

`performance.measureUserAgentSpecificMemory()`를 쓰려면 crossOriginIsolated
환경이 필요합니다. COOP/COEP 헤더를 붙인 정적 서버입니다.

```bash
python3 tools/coiserve.py 4712
```
