# 🐯 호야 맛집 탐험! - 노션 웹 링크 수집기 & PWA 모바일 앱

네이버 지도, 플레이스, 블로그, 인스타그램 등 맛집 링크를 입력하면 **식당명, 동네 위치, 요리 종류, 실제 대표 음식 사진**을 자동으로 추출하여 내 노션 맛집 갤러리(`166ad860bd648097afedff31acfa1fb5`)에 카드 형태로 실시간 저장해 주는 스마트 웹 애플리케이션입니다.

---

## 🚀 네틀리파이(Netlify) 무료 배포 방법

Netlify를 통해 배포하면 **무료 영구 HTTPS 주소(`https://hoya-food.netlify.app`)**가 발급되어, 외부(외식/길거리) LTE·5G 환경에서도 스마트폰 홈 화면 전용 앱으로 언제 어디서나 사용할 수 있습니다.

### 방법 1: GitHub 연동 자동 배포 (가장 추천 ⭐)

1. **GitHub 저장소 생성**:
   - [GitHub](https://github.com/new)에 접속하여 새 저장소(New Repository)를 만듭니다 (예: `hoya-food-explorer`).
2. **코드 푸시 (터미널에서 실행)**:
   ```bash
   git remote add origin https://github.com/<내-GitHub-아이디>/hoya-food-explorer.git
   git branch -M main
   git push -u origin main
   ```
3. **Netlify 연동**:
   - [Netlify](https://app.netlify.com/) 로그인 후 **[Add new site]** ➡️ **[Import an existing project]** ➡️ **[GitHub]** 선택.
   - 방금 올린 `hoya-food-explorer` 저장소를 선택합니다.
   - **Build settings**:
     - **Publish directory**: `public` (기본 설정되어 있음)
     - **Functions directory**: `netlify/functions` (자동 감지됨)
4. **환경 변수(Environment Variables) 등록 (선택이지만 강력 추천)**:
   - Netlify 사이트 대시보드 ➡️ **[Site configuration]** ➡️ **[Environment variables]** ➡️ **[Add a variable]**:
     - `NOTION_API_KEY`: 내 Notion 내부 통합 시크릿 키 (`ntn_...` 또는 `secret_...`)
     - `NOTION_TARGET_ID`: `166ad860bd648097afedff31acfa1fb5`
5. **[Deploy site]** 클릭 ➡️ 10초 만에 나만의 모바일 웹앱 배포 완료!

---

### 방법 2: 폴더 드래그 앤 드롭 즉시 배포 (Netlify Drop)

1. [Netlify Drop](https://app.netlify.com/drop) 페이지를 엽니다.
2. 현재 프로젝트 폴더 전체를 브라우저 점선 상자 영역에 드래그하여 놓습니다.
3. 5초 만에 사이트가 생성되고 무료 배포 링크가 발급됩니다.
4. 배포된 웹사이트 상단의 **`[⚙️ 설정]`**을 누르고 노션 API 키를 입력해 두시면 브라우저에 안전하게 저장됩니다.

---

## 💻 로컬 PC에서 바로 실행하기

- **더블 클릭 실행**: `start.bat` 파일을 더블 클릭하면 브라우저(`http://localhost:3000`)가 자동으로 열립니다.
- **터미널 실행**:
  ```bash
  node server.js
  ```

---

## 📱 스마트폰 홈 화면에 앱으로 설치하기 (PWA)

1. 배포된 Netlify URL(예: `https://hoya-food.netlify.app`)을 스마트폰 브라우저로 엽니다.
2. **아이폰 (Safari)**: 하단 **[공유 ⎋]** ➡️ **[홈 화면에 추가]** ➡️ 호야 호랑이 아이콘 확인 후 **[추가]**
3. **갤럭시 (Chrome)**: 상단 **[점 세 개 (···)]** ➡️ **[홈 화면에 추가]** 또는 **[앱 설치]**
4. 스마트폰 바탕화면에 귀여운 전용 앱 아이콘으로 생성되어 독립 앱처럼 사용하실 수 있습니다!
