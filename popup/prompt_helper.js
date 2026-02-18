// AI 프롬프트 생성 도우미
// 사용자가 자기 AI(Claude/GPT/Gemini)에 붙여넣어 Whisk용 프롬프트를 만들 수 있도록 템플릿 제공

const AI_PROMPT_TEMPLATES = {
  claude: `당신은 AI 이미지 생성 프롬프트 전문가입니다.

아래 대본/텍스트를 장면별로 분석하여, 각 장면에 대한 영어 이미지 생성 프롬프트를 작성해주세요.

## 규칙
- 한 줄에 하나의 프롬프트
- 영어로 작성
- 구체적인 시각 묘사 포함 (구도, 조명, 분위기, 색감, 스타일)
- 인물이 있다면 표정, 자세, 의상 묘사
- 출력은 프롬프트만 (번호, 설명, 구분선 없이)
- Whisk/이미지생성 AI에 최적화된 형식

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
- Optimized for Whisk/image generation AI

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
- Whisk/이미지생성 AI에 최적화

## 프롬프트 스타일 예시
a lone warrior standing on a misty mountain peak at dawn, dramatic backlight, cinematic composition, detailed armor with battle scars, determined expression, volumetric fog, epic fantasy style

## 대본
[여기에 대본을 붙여넣으세요]`
};

(function initPromptHelper() {
  const btn = document.getElementById('aiPromptHelperBtn');
  const modal = document.getElementById('aiPromptModal');
  const promptText = document.getElementById('aiPromptText');
  const copyBtn = document.getElementById('copyAiPromptBtn');
  const closeBtn = document.getElementById('closeAiPromptBtn');
  const tabs = modal.querySelectorAll('.ai-tab');

  let currentAI = 'claude';

  function showPrompt(ai) {
    currentAI = ai;
    promptText.textContent = AI_PROMPT_TEMPLATES[ai];
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.ai === ai);
    });
    copyBtn.textContent = '복사';
  }

  btn.addEventListener('click', () => {
    modal.hidden = false;
    showPrompt(currentAI);
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showPrompt(tab.dataset.ai));
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATES[currentAI]);
      copyBtn.textContent = '복사됨!';
      setTimeout(() => { copyBtn.textContent = '복사'; }, 2000);
    } catch {
      // fallback: select text
      const range = document.createRange();
      range.selectNodeContents(promptText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
})();
