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
    'nlm-slides':      {'generate': 'slide_deck',  'download': 'slide_deck',  'ext': 'pptx', 'label': '슬라이드 덱'},
    'nlm-audio':       {'generate': 'audio',        'download': 'audio',       'ext': 'mp3',  'label': '오디오 요약'},
    'nlm-video':       {'generate': 'video',        'download': 'video',       'ext': 'mp4',  'label': '영상 요약'},
    'nlm-infographic': {'generate': 'infographic',  'download': 'infographic', 'ext': 'png',  'label': '인포그래픽'},
    'nlm-quiz':        {'generate': 'quiz',         'download': 'quiz',        'ext': 'md',   'label': '퀴즈',       'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-flashcards':  {'generate': 'flashcards',   'download': 'flashcards',  'ext': 'md',   'label': '플래시카드', 'dl_kwargs': {'output_format': 'markdown'}},
    'nlm-datatable':   {'generate': 'data_table',   'download': 'data_table',  'ext': 'csv',  'label': '데이터 표'},
    'nlm-report':      {'generate': 'report',       'download': 'report',      'ext': 'md',   'label': '브리핑 문서'},
    'nlm-mindmap':     {'generate': 'mind_map',     'download': 'mind_map',    'ext': 'json', 'label': '마인드맵',   'no_wait': True},
}

def log(data):
    print(json.dumps(data, ensure_ascii=False), flush=True)

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
                log({'progress': '콘텐츠 업로드 중...', 'step': 2, 'total': 5})
                await client.sources.add_text(nb_id, title=title, content=content, wait=True)

                log({'progress': f'{cfg["label"]} 생성 중... (시간이 걸릴 수 있습니다)', 'step': 3, 'total': 5})
                gen_fn = getattr(client.artifacts, f'generate_{cfg["generate"]}')

                if cfg.get('no_wait'):
                    # mind_map은 결과 직접 반환, wait 불필요
                    await gen_fn(nb_id)
                else:
                    status = await gen_fn(nb_id, language=language)
                    task_id = status.task_id if hasattr(status, 'task_id') else status['task_id']

                    log({'progress': '생성 완료 대기 중...', 'step': 4, 'total': 5})
                    await client.artifacts.wait_for_completion(nb_id, task_id)

                log({'progress': '파일 다운로드 중...', 'step': 5, 'total': 5})

                os.makedirs(output_dir, exist_ok=True)
                out_path = os.path.join(output_dir, f'tidy-{skill_id}.{cfg["ext"]}')

                dl_fn = getattr(client.artifacts, f'download_{cfg["download"]}')
                dl_kwargs = cfg.get('dl_kwargs', {})
                await dl_fn(nb_id, out_path, **dl_kwargs)

                log({'done': True, 'path': out_path, 'ext': cfg['ext'], 'label': cfg['label']})

            finally:
                try:
                    await client.notebooks.delete(nb_id)
                except Exception:
                    pass

    except FileNotFoundError:
        log({'error': 'notebooklm login을 먼저 실행해주세요.', 'setup_required': True, 'step': 'login'})
        sys.exit(1)
    except Exception as e:
        log({'error': str(e)})
        sys.exit(1)

asyncio.run(main())
