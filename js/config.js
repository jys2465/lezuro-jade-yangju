/* ★ 개발자가 고치는 파일입니다. 비밀번호나 열쇠는 들어 있지 않아서, 저장소가 공개(Public)여도 안전합니다.
 *
 *  BRANCHES: 지점 목록. 지점마다 서버(구글 시트 + 앱스크립트)가 따로 있어요.
 *    - 앞의 영문(yangju, mansong)이 지점 코드예요. 그 지점 Code.gs 의 BRANCH 와 같아야 해요. 한 번 정하면 바꾸지 마세요.
 *    - name: 지점을 고를 때 보이는 이름
 *    - API: 그 지점 앱스크립트의 "웹 앱 URL" (https://script.google.com/macros/s/…/exec)
 *  DEFAULT: 주소에 ?s= 가 없을 때 여는 지점(처음부터 쓰던 지점)
 *
 *  지점별 주소: https://아이디.github.io/저장소/?s=mansong  처럼 끝에 ?s=지점코드 를 붙여요.
 *  (회원 초대 안내문에는 자동으로 붙어요) */
window.LZ_CONFIG = {
  DEFAULT: 'yangju',
  BRANCHES: {
    yangju:  { name: '제이드 양주점', API: 'https://script.google.com/macros/s/AKfycbwljj0_EyrOuql6-EQ00J_6h-jgeaWH7hDBtaGRSDkbC49pxL2yMQnVZQYjM25GzDRRtg/exec' },
    mansong: { name: '양주만송점',   API: 'https://script.google.com/macros/s/AKfycbzgBYuiRMdikw5_7zH9cPWsgggViwOZCRbZYZnbfUZ2JX54QpnsMxMvUU3Mj7DF_GLx2w/exec' }
    suyu: { name: '강북수유점',   API: 'YOUR_MANSONG_APPS_SCRIPT_URL' }
  }
};
