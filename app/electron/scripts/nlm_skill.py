#!/usr/bin/env python3
"""
Tidy NotebookLM skill runner.
Usage: python nlm_skill.py <skill_id> <output_dir>
Input JSON via stdin: {"content": "...", "language": "ko", "title": "..."}
Outputs JSON lines to stdout for progress tracking.
"""
import asyncio
import sys
import json
import os

SKILL_CONFIG = {
    # timeout: asyncio.wait_for 타임아웃 (초)
    # source_timeout: add_text wait_timeout (초)
    # no_language: True → generate 호출 시 language 파라미터 미전달
    # source_timeout: 소스 인덱싱 대기 — 4000자 이하면 보통 30~60s면 충분
    # gen_timeout: generate 함수 호출 자체의 타임아웃 (task_id 반환까지)
    'nlm-slides':      {'generate': 'slide_deck',  'download': 'slide_deck',  'ext': 'pptx', 'label': '슬라이드 덱',  'timeout': 600,  'source_timeout': 90, 'gen_timeout': 60},
    'nlm-quiz':        {'generate': 'quiz',         'download': 'quiz',        'ext': 'md',   'label': '퀴즈',         'timeout': 600,  'source_timeout': 60,  'gen_timeout': 120, 'no_language': True, 'include_content': True, 'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-flashcards':  {'generate': 'flashcards',   'download': 'flashcards',  'ext': 'md',   'label': '플래시카드',   'timeout': 600,  'source_timeout': 60,  'gen_timeout': 120, 'no_language': True, 'include_content': True, 'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-datatable':   {'generate': 'data_table',   'download': 'data_table',  'ext': 'csv',  'label': '데이터 표',    'timeout': 600,  'source_timeout': 60,  'gen_timeout': 120, 'no_language': True},
    'nlm-mindmap':     {'generate': 'mind_map',     'download': 'mind_map',    'ext': 'html', 'label': '마인드맵',     'timeout': 300,  'source_timeout': 60,  'no_wait': True, 'post': 'mindmap_to_html'},
}


def log(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def mindmap_to_html(json_path, html_path):
    """NotebookLM 마인드맵 JSON → Markmap 시각화"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        raise RuntimeError(f'마인드맵 JSON 파싱 실패: {e}')

    def to_markdown(node, depth=1):
        if not node or not isinstance(node, dict):
            return ''
        text = (node.get('text') or node.get('title') or node.get('name') or node.get('label') or '').strip()
        children = node.get('children') or node.get('nodes') or node.get('items') or []
        lines = []
        if text:
            lines.append('#' * min(depth, 6) + ' ' + text)
        for child in children:
            child_md = to_markdown(child, depth + 1)
            if child_md:
                lines.append(child_md)
        return '\n'.join(lines)

    raw_root = data.get('root') or data.get('mind_map') or data
    if isinstance(raw_root, list):
        raw_root = {'children': raw_root}
    markdown = to_markdown(raw_root)

    if not markdown.strip():
        raise RuntimeError('마인드맵 내용이 비어있습니다.')

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>마인드맵</title>
<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.16"></script>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 100%; height: 100%; background: #ffffff; }}
  .markmap {{ width: 100vw; height: 100vh; }}
</style>
</head>
<body>
<div class="markmap">
<script type="text/template">
---
markmap:
  colorFreezeLevel: 2
  initialExpandLevel: 3
  zoom: true
  pan: true
---
{markdown}
</script>
</div>
</body>
</html>"""

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)


async def main():
    if len(sys.argv) < 3:
        log({'error': 'Usage: nlm_skill.py <skill_id> <output_dir>'})
        sys.exit(1)

    skill_id = sys.argv[1]
    output_dir = sys.argv[2]

    try:
        raw = sys.stdin.read()
        inp = json.loads(raw) if raw.strip() else {}
    except Exception:
        inp = {}

    content = inp.get('content', '')
    language = inp.get('language', 'ko')
    title = inp.get('title', 'Tidy Input')

    cfg = SKILL_CONFIG.get(skill_id)
    if not cfg:
        log({'error': f'지원하지 않는 스킬: {skill_id}'})
        sys.exit(1)

    try:
        from notebooklm import NotebookLMClient
    except ImportError:
        log({'error': 'notebooklm-py 미설치', 'setup_required': True, 'step': 'install'})
        sys.exit(1)

    try:
        log({'progress': '노트북 생성 중...', 'step': 1, 'total': 5})

        async with await NotebookLMClient.from_storage() as client:
            nb = await client.notebooks.create(title=f'tidy-{skill_id}')
            nb_id = nb.id if hasattr(nb, 'id') else nb['id']

            try:
                source_timeout = cfg.get('source_timeout', 180)
                completion_timeout = cfg.get('timeout', 600)

                log({'progress': '콘텐츠 업로드 중...', 'step': 2, 'total': 5})
                await client.sources.add_text(
                    nb_id, title=title, content=content,
                    wait=True, wait_timeout=source_timeout
                )

                log({'progress': f'{cfg["label"]} 생성 중... (시간이 걸릴 수 있습니다)', 'step': 3, 'total': 5})
                gen_fn = getattr(client.artifacts, f'generate_{cfg["generate"]}')
                gen_timeout = cfg.get('gen_timeout', 300)

                if cfg.get('no_wait'):
                    # mind_map은 generate 자체가 완료까지 대기 (GenerationStatus 반환 안 함)
                    await asyncio.wait_for(gen_fn(nb_id), timeout=completion_timeout)
                    log({'progress': '생성 완료', 'step': 4, 'total': 5})
                else:
                    gen_kwargs = {} if cfg.get('no_language') else {'language': language}
                    # generate 호출 자체도 타임아웃 적용 (무한 대기 방지)
                    status = await asyncio.wait_for(gen_fn(nb_id, **gen_kwargs), timeout=gen_timeout)
                    task_id = status.task_id if hasattr(status, 'task_id') else status['task_id']

                    log({'progress': f'생성 완료 대기 중... (최대 {completion_timeout // 60}분)', 'step': 4, 'total': 5})
                    await asyncio.wait_for(
                        client.artifacts.wait_for_completion(nb_id, task_id),
                        timeout=completion_timeout
                    )

                log({'progress': '파일 다운로드 중...', 'step': 5, 'total': 5})

                os.makedirs(output_dir, exist_ok=True)
                out_path = os.path.join(output_dir, f'tidy-{skill_id}.{cfg["ext"]}')

                if cfg.get('post') == 'mindmap_to_html':
                    # JSON으로 받은 뒤 HTML로 변환
                    json_path = out_path.replace('.html', '.json')
                    dl_fn = getattr(client.artifacts, f'download_{cfg["download"]}')
                    await dl_fn(nb_id, json_path)
                    try:
                        mindmap_to_html(json_path, out_path)
                    finally:
                        if os.path.exists(json_path):
                            os.remove(json_path)
                else:
                    dl_fn = getattr(client.artifacts, f'download_{cfg["download"]}')
                    dl_kwargs = cfg.get('dl_kwargs', {})
                    await dl_fn(nb_id, out_path, **dl_kwargs)

                if cfg.get('include_content'):
                    try:
                        with open(out_path, 'r', encoding='utf-8') as _f:
                            _content = _f.read()
                    except Exception:
                        _content = None
                    log({'done': True, 'path': out_path, 'ext': cfg['ext'], 'label': cfg['label'], 'content': _content})
                else:
                    log({'done': True, 'path': out_path, 'ext': cfg['ext'], 'label': cfg['label']})

            finally:
                try:
                    await client.notebooks.delete(nb_id)
                except Exception:
                    pass

    except asyncio.TimeoutError:
        mins = cfg.get('timeout', 600) // 60
        log({'error': f'시간 초과 ({mins}분). 텍스트를 줄이거나 나중에 다시 시도하세요.'})
        sys.exit(1)
    except FileNotFoundError:
        log({'error': 'notebooklm login을 먼저 실행해주세요.', 'setup_required': True, 'step': 'login'})
        sys.exit(1)
    except Exception as e:
        log({'error': str(e)})
        sys.exit(1)


asyncio.run(main())
