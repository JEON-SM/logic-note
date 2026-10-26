# Logic Note

도형과 선으로 생각을 잇는 개인용 노트. 브라우저에서 돌아가고, Windows·갤럭시 기기에 앱처럼 설치할 수 있습니다(PWA).

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 에 정적 파일 생성
```

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 GitHub Pages에 올립니다. 저장소의 **Settings › Secrets and variables › Actions › Variables**에 `GOOGLE_CLIENT_ID`를 넣어 두면 그 클라이언트 ID가 앱에 내장되어, 기기마다 입력할 필요가 없습니다.

올린 주소를 Edge/Chrome에서 열고 주소창의 **앱 설치**를 누르면 Windows 앱으로, 갤럭시의 Chrome·삼성 인터넷에서 **홈 화면에 추가**하면 휴대폰/태블릿 앱으로 쓸 수 있습니다. 설치 후에는 오프라인에서도 열립니다.

### Windows 실행 파일 (.exe)

`desktop/`에 작은 실행기가 있습니다. 더블클릭하면 Logic Note를 Chrome(없으면 Edge)의 독립된 앱 창으로 엽니다. 브라우저 안에서 열리므로 Google 로그인·Drive 동기화·오프라인이 그대로 동작합니다(앱 전용 내장 브라우저는 Google이 로그인을 막습니다).

```bash
node desktop/make-icon.mjs          # 로고 → desktop/logo.ico (아이콘을 바꿀 때만)
pwsh -File desktop/build.ps1        # 바탕 화면에 'Logic Note.exe' 생성
```

## 기능

- **캔버스**: 사각형·둥근 사각형·원·마름모·평행사변형·육각형 상자. 가장자리 점을 끌어 다른 상자와 연결하고, 빈 곳에 놓으면 이어지는 상자가 생깁니다.
- **연결선**: 곡선/직선/꺾은선, 화살표/양방향/선만, 점선, 색, 두께, 라벨(선을 두 번 누르기).
- **상자 내용**: 제목과 설명을 따로 씁니다. 이미지·영상(파일, 붙여넣기, 끌어다 놓기), 링크 미리보기, YouTube 재생 카드.
- **상자 크기**: 글에 맞춰 자동으로 커지고 줄어듭니다. 선택하면 오른쪽 손잡이로 폭을 고정할 수 있습니다(두 번 누르면 다시 자동).
- **서식**: 글꼴(기본·명조·둥근 고딕·손글씨·코드), 크기, 굵게·기울임·밑줄·취소선, 글자색, 형광펜(색 선택), 정렬, 글머리 기호·번호·체크리스트. 편집 중엔 선택한 글자에만, 편집 중이 아닐 땐 선택한 상자 전체에 적용됩니다.
- **색 고르기**: 주요 색과 최근 사용한 색, **고급 설정**을 누르면 전체 스펙트럼 + HEX 입력.
- **배경**: 모눈, 넓은 모눈, 그리드(점), 넓은 그리드(점), 없음. 노트마다 따로 정하고 기본값도 바꿀 수 있습니다.
- **다크 모드**: 시스템/라이트/다크. 무채색(검정·회색·흰색)은 모드가 바뀌면 자동으로 반전되고, 글자가 바탕에 묻히면 읽히는 쪽으로 뒤집힙니다. 유채색은 그대로 둡니다.
- **정리**: 폴더 안에 폴더(트리), 즐겨찾기, 휴지통, 검색, 정렬. 폴더를 누르면 하위 폴더와 노트 미리보기가 카드로 보입니다. 노트 카드를 사이드바 폴더로 끌어다 옮길 수 있습니다.
- **AI 도식 가져오기**: Claude·ChatGPT 등이 그려 준 Mermaid(flowchart·graph·mindmap)나 Graphviz(DOT) 코드를 상자와 연결선으로 바꿔 자동 배치합니다. 모양·색·점선·라벨도 옮겨 옵니다.
  - 캔버스에 AI 답변을 그대로 **붙여넣기(Ctrl+V)** 하거나, `.mmd`/`.dot` 파일을 끌어다 놓거나, 편집기 ⋮ 메뉴·노트 목록 상단의 **가져오기** 버튼을 씁니다.
  - 가져오기 창의 **AI에게 보낼 요청문 복사**로 AI가 바로 가져올 수 있는 형식으로 답하게 할 수 있습니다.
- **내보내기**: 편집기 ⋮ 메뉴 › 내보내기. 노트 전체를 **PNG·SVG 그림**으로 저장하거나 클립보드에 복사하고, **Mermaid·Graphviz 코드**로 복사·저장합니다. Mermaid는 Claude·ChatGPT에 붙여넣으면 구조를 그대로 읽고, Notion·GitHub·Obsidian에서는 그림으로 보이며, Logic Note로 다시 가져올 수도 있습니다.
- **실행 취소/다시 실행**, 복사/붙여넣기, 백업 내보내기·가져오기(JSON).

### 단축키 (캔버스)

| 키 | 동작 |
| --- | --- |
| 빈 곳 두 번 클릭 | 상자 만들기 |
| 상자 두 번 클릭 / Enter | 편집 |
| Enter (제목에서) | 설명으로 이동 |
| Esc | 편집 끝내기 / 선택 해제 |
| Tab | 선택한 상자 옆에 연결된 상자 추가 |
| Ctrl+Z / Ctrl+Y | 실행 취소 / 다시 실행 |
| Ctrl+C / Ctrl+V / Ctrl+D | 복사 / 붙여넣기 / 복제 |
| Delete, Backspace | 삭제 |
| Shift+드래그 | 여러 개 선택 (선택 도구에선 그냥 드래그) |

## Google Drive 동기화 설정

동기화하면 **내 드라이브 › Logic Note** 폴더 아래에 앱의 폴더 구조가 그대로 만들어지고, 노트는 하나씩 `제목.lnote` 파일로 저장됩니다. 이미지·영상은 `Logic Note/.media`에 들어갑니다. 권한은 `drive.file`이라 **이 앱이 만든 파일에만** 접근합니다.

처음 한 번만 Google Cloud에서 클라이언트 ID를 만들면 됩니다.

1. <https://console.cloud.google.com> 에서 새 프로젝트를 만듭니다.
2. **API 및 서비스 › 라이브러리**에서 **Google Drive API**를 사용 설정합니다.
3. **OAuth 동의 화면**: 사용자 유형 *외부*, 앱 이름 입력, **테스트 사용자**에 본인 Gmail을 추가합니다.
4. **사용자 인증 정보 › 사용자 인증 정보 만들기 › OAuth 클라이언트 ID** → 유형 *웹 애플리케이션*.
   **승인된 JavaScript 원본**에 앱을 여는 주소를 모두 넣습니다. 예: `http://localhost:5173`, `https://내아이디.github.io`
5. 만들어진 클라이언트 ID(`….apps.googleusercontent.com`)를 저장소 변수 `GOOGLE_CLIENT_ID`에 넣고 다시 배포하거나, 앱의 **설정 › Google Drive 동기화**에 직접 붙여넣은 뒤 **Google 계정 연결**을 누릅니다.

다른 기기에서도 같은 주소로 열고, 같은 클라이언트 ID로 연결하면 같은 노트가 보입니다.

- 수정하면 몇 초 뒤, 그리고 3분마다·앱으로 돌아올 때 자동으로 동기화합니다. 상단의 구름 아이콘을 누르면 바로 동기화합니다.
- Google 로그인 토큰은 1시간마다 만료됩니다. 구름 아이콘에 주황 표시가 뜨면 눌러서 다시 로그인하세요(보통 클릭 한 번).
- 두 기기에서 같은 노트를 동기화 전에 각각 고쳤다면, 최신 쪽을 남기고 다른 쪽은 `(다른 기기)`/`(이 기기)` 사본으로 보존합니다.

## 데이터

노트는 브라우저의 IndexedDB에 저장됩니다(기기마다 따로). 동기화를 안 쓴다면 **설정 › 백업**으로 가끔 내보내 두세요. 링크 미리보기는 microlink.io로 링크 주소를 보내 가져오며, 설정에서 끌 수 있습니다.

## 사용한 라이브러리

직접 만들기 전에 있는 것을 먼저 썼습니다.

| 역할 | 라이브러리 |
| --- | --- |
| 캔버스·연결선·확대/이동 | [React Flow](https://reactflow.dev) (`@xyflow/react`) |
| 서식 있는 글 편집 | [Tiptap](https://tiptap.dev) |
| 로컬 저장 | [Dexie](https://dexie.org) (IndexedDB) |
| 메뉴·팝오버·대화상자 | [Radix UI](https://www.radix-ui.com) |
| 색 스펙트럼 | [react-colorful](https://github.com/omgovich/react-colorful) |
| 상태 | [Zustand](https://zustand.docs.pmnd.rs) |
| 아이콘 / 글꼴 | [Lucide](https://lucide.dev) / [Pretendard](https://github.com/orioncactus/pretendard) |
| 앱 설치·오프라인 | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) |
| 붙여넣은 HTML 정리 | [DOMPurify](https://github.com/cure53/DOMPurify) |
| AI 도식 읽기 | [Mermaid](https://mermaid.js.org) 공식 파서, [ts-graphviz](https://github.com/ts-graphviz/ts-graphviz) |
| 자동 배치 | [dagre](https://github.com/dagrejs/dagre) |
| 그림 내보내기 | [html-to-image](https://github.com/bubkoo/html-to-image) (React Flow 공식 예제 방식) |
| 코드 내보내기 | Mermaid(직접 생성), Graphviz는 ts-graphviz의 `toDot` |
