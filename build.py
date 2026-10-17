# src/ 의 스타일·화면·스크립트를 합쳐 index.html 하나로 만든다 (배포는 index.html만)
import pathlib
R=pathlib.Path(__file__).parent
css=(R/'src/style.css').read_text(encoding='utf-8')
shell=(R/'src/shell.html').read_text(encoding='utf-8')
js=(R/'src/app.js').read_text(encoding='utf-8')
html=f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>돈주셈</title>
<meta name="description" content="부부가 돈을 합쳐 관리하고 각자 용돈을 쓰는 가계부">
<meta name="theme-color" content="#ECECEA" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E100E" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="돈주셈">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="manifest" href="manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Gothic+A1:wght@400;500;600;700&display=swap">
<style>{css}</style>
</head>
<body>
{shell}
<script>
{js}
</script>
</body>
</html>
'''
(R/'index.html').write_text(html,encoding='utf-8')
print('index.html', len(html))
