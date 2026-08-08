# EBB & GRAB : 썰물의 도둑

썰물이 드러낸 바다 바닥에서 보물을 줍고, 밀물이 삼키기 전에 마을로 돌아오는 3D 쿼터뷰 액션.
브라우저에서 바로 실행됩니다. 빌드 스텝이 없습니다.

플레이: https://ebb.flowoodz.com

## 실행

정적 파일이라 아무 정적 서버나 됩니다.

```bash
python3 -m http.server 4399
# http://127.0.0.1:4399
```

## 구성

- `index.html` : 진입점, HUD, importmap
- `src/` : 게임 로직 (ES 모듈)
- `vendor/three/` : three.js r185 로컬 번들
- `assets/models/` : glTF 프롭
- `assets/audio/` : 배경음 3곡
- `Dockerfile`, `nginx.conf` : 배포용 (nginx 정적 서빙)

설계 문서는 `DESIGN.md`.

## 크레딧

- 아트: [Proof of Play, Pirate Nation Art](https://github.com/proofofplay/piratenation-art) (CC0-1.0)
- 음악: beardalaxy, Sudocolon, wipics (OpenGameArt, CC0-1.0)
- 효과음: WebAudio 실시간 합성
