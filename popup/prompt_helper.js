// AI 프롬프트 생성 도우미
// Flow 이미지 프롬프트 + Grok 모션 프롬프트 두 가지 컨텍스트 지원

// ============================================================
// Flow 이미지 프롬프트 템플릿
// ============================================================
const FLOW_PROMPT_TEMPLATES = {
  claude: `당신은 AI 이미지 생성 프롬프트 전문가입니다.

아래 대본/텍스트를 장면별로 분석하여, 각 장면에 대한 영어 이미지 생성 프롬프트를 작성해주세요.

## 규칙
- 한 줄에 하나의 프롬프트
- 영어로 작성
- 구체적인 시각 묘사 포함 (구도, 조명, 분위기, 색감, 스타일)
- 인물이 있다면 표정, 자세, 의상 묘사
- 출력은 프롬프트만 (번호, 설명, 구분선 없이)
- Flow/이미지생성 AI에 최적화된 형식

## 프롬프트 스타일 예시
a lone warrior standing on a misty mountain peak at dawn, dramatic backlight, cinematic composition, detailed armor with battle scars, determined expression, volumetric fog, epic fantasy style

## 대본
[여기에 대본을 붙여넣으세요]`,

  gpt: `You are an expert at writing image generation prompts.

Analyze the script/text below scene by scene and write one English image generation prompt per scene.

## Rules
- One prompt per line
- Write in English
- Include specific visual details (composition, lighting, mood, color palette, style)
- Describe characters with expressions, poses, and costumes if present
- Output ONLY the prompts (no numbers, no explanations, no dividers)
- Optimized for Flow/image generation AI

## Prompt style example
a lone warrior standing on a misty mountain peak at dawn, dramatic backlight, cinematic composition, detailed armor with battle scars, determined expression, volumetric fog, epic fantasy style

## Script
[여기에 대본을 붙여넣으세요 / Paste your script here]`,

  gemini: `이미지 생성 프롬프트 전문가로서 아래 대본을 분석해주세요.

각 장면마다 영어 이미지 생성 프롬프트를 한 줄씩 작성해주세요.

## 규칙
- 한 줄에 하나의 프롬프트
- 영어로 작성
- 시각적 디테일 구체적으로 (구도, 조명, 분위기, 색감, 스타일)
- 인물: 표정, 자세, 의상 포함
- 출력은 프롬프트만 (번호/설명/구분선 없이)
- Flow/이미지생성 AI에 최적화

## 프롬프트 스타일 예시
a lone warrior standing on a misty mountain peak at dawn, dramatic backlight, cinematic composition, detailed armor with battle scars, determined expression, volumetric fog, epic fantasy style

## 대본
[여기에 대본을 붙여넣으세요]`
};

// ============================================================
// Grok 모션 프롬프트 템플릿
// ============================================================
const GROK_MOTION_TEMPLATES = {
  claude: `당신은 AI 영상 모션 프롬프트 전문가입니다.

아래 대본/텍스트를 장면별로 분석하여, 각 장면의 **영상 모션 프롬프트**를 작성해주세요.
이 프롬프트는 이미지를 영상으로 변환할 때 사용됩니다 (Grok AI 이미지→영상 변환).

## 규칙
- 한 줄에 하나의 모션 프롬프트
- 영어로 작성
- 장면의 분위기와 내용에 맞는 카메라 움직임 + 피사체 움직임 묘사
- 10~20 단어 이내로 간결하게
- 출력은 프롬프트만 (번호, 설명, 구분선 없이)

## 사용 가능한 모션 요소
- 카메라: slow zoom in, zoom out, pan left/right, tilt up/down, dolly in, tracking shot, crane shot, orbital shot
- 피사체: walking, turning, hair blowing, breathing, subtle movement
- 분위기: rain falling, fog drifting, light flickering, leaves swirling, dust particles

## 모션 프롬프트 예시
slow zoom in on face, subtle breathing, wind blowing through hair, dramatic lighting shift
gentle pan right across battlefield, dust particles floating, distant figures moving
camera slowly pulls back revealing vast landscape, clouds drifting, cinematic atmosphere

## 대본
[여기에 대본을 붙여넣으세요]`,

  gpt: `You are an expert at writing video motion prompts for image-to-video AI conversion.

Analyze the script below scene by scene and write one **motion prompt** per scene.
These prompts will be used with Grok AI to convert still images into short videos.

## Rules
- One motion prompt per line
- Write in English
- Describe camera movement + subject movement matching the scene's mood
- Keep each prompt 10-20 words
- Output ONLY the prompts (no numbers, no explanations, no dividers)

## Available motion elements
- Camera: slow zoom in, zoom out, pan left/right, tilt up/down, dolly in, tracking shot, crane shot, orbital shot
- Subject: walking, turning, hair blowing, breathing, subtle movement
- Atmosphere: rain falling, fog drifting, light flickering, leaves swirling, dust particles

## Motion prompt examples
slow zoom in on face, subtle breathing, wind blowing through hair, dramatic lighting shift
gentle pan right across battlefield, dust particles floating, distant figures moving
camera slowly pulls back revealing vast landscape, clouds drifting, cinematic atmosphere

## Script
[여기에 대본을 붙여넣으세요 / Paste your script here]`,

  gemini: `영상 모션 프롬프트 전문가로서 아래 대본을 분석해주세요.

각 장면마다 **영상 모션 프롬프트**를 한 줄씩 작성해주세요.
이미지를 영상으로 변환하는 Grok AI에서 사용됩니다.

## 규칙
- 한 줄에 하나의 모션 프롬프트
- 영어로 작성
- 장면 분위기에 맞는 카메라 움직임 + 피사체 움직임
- 10~20 단어 이내 간결하게
- 출력은 프롬프트만 (번호/설명/구분선 없이)

## 사용 가능한 모션 요소
- 카메라: slow zoom in, zoom out, pan left/right, tilt up/down, dolly in, tracking shot, crane shot, orbital shot
- 피사체: walking, turning, hair blowing, breathing, subtle movement
- 분위기: rain falling, fog drifting, light flickering, leaves swirling, dust particles

## 모션 프롬프트 예시
slow zoom in on face, subtle breathing, wind blowing through hair, dramatic lighting shift
gentle pan right across battlefield, dust particles floating, distant figures moving
camera slowly pulls back revealing vast landscape, clouds drifting, cinematic atmosphere

## 대본
[여기에 대본을 붙여넣으세요]`
};

// ============================================================
// 모달 로직 (Whisk + Grok 공유)
// ============================================================
(function initPromptHelper() {
  const modal = document.getElementById('aiPromptModal');
  const modalTitle = modal.querySelector('h3');
  const modalDesc = modal.querySelector('.modal-desc');
  const promptText = document.getElementById('aiPromptText');
  const copyBtn = document.getElementById('copyAiPromptBtn');
  const closeBtn = document.getElementById('closeAiPromptBtn');
  const tabs = modal.querySelectorAll('.ai-tab');

  let currentAI = 'claude';
  let currentContext = 'flow'; // 'flow' or 'grok'

  function getTemplates() {
    return currentContext === 'grok' ? GROK_MOTION_TEMPLATES : FLOW_PROMPT_TEMPLATES;
  }

  function showPrompt(ai) {
    currentAI = ai;
    promptText.textContent = getTemplates()[ai];
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.ai === ai);
    });
    copyBtn.textContent = '복사';
  }

  function openModal(context) {
    currentContext = context;
    if (context === 'grok') {
      modalTitle.textContent = 'AI 모션 프롬프트 생성 도우미';
      modalDesc.textContent = '아래 프롬프트를 복사하여 AI에 붙여넣고, 대본을 함께 입력하세요. 결과를 txt로 저장 후 불러오기하세요.';
    } else {
      modalTitle.textContent = 'AI 프롬프트 생성 도우미';
      modalDesc.textContent = '아래 프롬프트를 복사하여 AI에 붙여넣고, 대본을 함께 입력하세요.';
    }
    modal.hidden = false;
    showPrompt(currentAI);
  }

  // Flow 버튼
  document.getElementById('aiPromptHelperBtn').addEventListener('click', () => openModal('flow'));

  // Grok 버튼
  document.getElementById('grokAiPromptBtn').addEventListener('click', () => openModal('grok'));

  // 탭 전환
  tabs.forEach(tab => {
    tab.addEventListener('click', () => showPrompt(tab.dataset.ai));
  });

  // 복사
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getTemplates()[currentAI]);
      copyBtn.textContent = '복사됨!';
      setTimeout(() => { copyBtn.textContent = '복사'; }, 2000);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(promptText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // 닫기
  closeBtn.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  // ============================================================
  // Grok 모션 프롬프트 파일 불러오기
  // ============================================================
  const grokPromptFileInput = document.getElementById('grokPromptFileInput');
  const grokPromptResult = document.getElementById('grokPromptLoadResult');

  grokPromptFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      if (lines.length === 0) {
        showPromptResult('프롬프트가 비어 있습니다.', 'error');
        return;
      }

      // grok.js에서 접근할 수 있도록 커스텀 이벤트로 전달
      window.dispatchEvent(new CustomEvent('grokMotionPromptsLoaded', {
        detail: { prompts: lines }
      }));

      showPromptResult(`${lines.length}개 모션 프롬프트 로드 완료!`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function showPromptResult(message, type) {
    grokPromptResult.textContent = message;
    grokPromptResult.className = 'grok-prompt-result ' + type;
    grokPromptResult.hidden = false;
    setTimeout(() => { grokPromptResult.hidden = true; }, 4000);
  }
})();
