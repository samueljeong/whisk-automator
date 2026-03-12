const DEBUG = false;

// Flow/Imagen 프롬프트 안전 치환 규칙
// 위험 표현 → 안전 표현 자동 변환
// DB: outputs/whisk/prompt_safety_db.json과 동기화
const PROMPT_REPLACEMENTS = [
  // === 피/부상 (Blood/Injury) ===
  ["blood splashing", "red impact marks scattering"],
  ["blood-covered face", "battle-worn face with red marks"],
  ["blood on face and torn clothes", "battle-worn face and torn clothes"],
  ["blood on face", "red marks on face"],
  ["blood on cracked armor", "cracked armor with red stains"],
  ["blood at corner of mouth", "red mark at corner of mouth"],
  ["bloody trail behind him", "marks left on the floor behind him"],
  ["bloody trail", "marks left on stone floor"],
  ["spitting blood but grinning", "coughing from impact but grinning"],
  ["spitting blood", "coughing from the impact"],
  ["multiple small wounds visible", "multiple battle marks visible"],

  // === 살의/폭력 의도 (Killing Intent) ===
  ["cold killing intent", "intense overwhelming pressure"],
  ["killing intent", "overwhelming fighting spirit"],
  ["devastating finishing blow", "overwhelming final strike"],

  // === 독/독무기 (Poison + Weapons) ===
  ["purple venom dripping from the blade", "purple energy emanating from the blade"],
  ["purple venom glistening on each blade", "purple energy glistening on each blade"],
  ["sword clashing against poisoned short blade", "sword clashing against purple-coated short blade"],
  ["poisoned short blade", "short blade coated in purple energy"],
  ["short curved blade coated in purple poison", "short curved blade coated in purple energy"],
  ["three poisoned throwing knives", "three enchanted throwing blades with purple aura"],
  ["poisoned throwing knives", "enchanted throwing blades with purple aura"],
  ["poisoned throwing knife", "enchanted throwing blade with purple aura"],

  // === 신체 타격 묘사 (Physical Impact) ===
  ["striking young man in the ribs", "powerful impact pushing the young man backward"],
  ["golden kick smashing into warrior's side", "golden kick impacting the warrior's side"],
  ["slamming into corridor wall creating deep crater", "crashing into corridor wall with tremendous force"],
  ["launched backward through stone wall", "sent flying backward through stone wall"],
  ["spear shaft striking", "spear shaft connecting"],
  ["knife grazing past his ear", "blade whistling past his ear"],
  ["simultaneously throwing a knife at close range", "simultaneously launching a blade at close range"],

  // === 화상/피부 손상 (Burns/Skin Damage) ===
  ["fire energy causing the wound to sear", "fire energy sealing the injury"],
  ["wound to sear", "energy to cauterize"],
  ["left sleeve catching fire", "heat scorching the left sleeve"],
  ["skin immediately blistering and swelling", "skin reddening from exposure"],
  ["burn mark forming on forearm", "heat mark forming on forearm"],

  // === 기타 (Misc) ===
  ["black-robed cult warriors", "dark-robed elite warriors"],
  ["cult warriors", "dark-robed elite warriors"],
  ["chained to stone wall", "confined against stone wall"],

  // === 유명인/실존 인물 (Public Figures → Generic Descriptions) ===
  // 정치인
  ["Donald Trump", "an older Caucasian man in a navy suit with a red tie, confident posture"],
  ["Trump", "an older Caucasian man in a navy suit with a red tie"],
  ["Joe Biden", "an elderly Caucasian man with white hair in a dark suit"],
  ["Biden", "an elderly Caucasian man with white hair in a dark suit"],
  ["Barack Obama", "a middle-aged man in a dark suit with a warm smile"],
  ["Obama", "a middle-aged man in a dark suit with a warm smile"],
  ["Xi Jinping", "an East Asian leader in a dark formal suit"],
  ["Putin", "a stern-looking older man in a dark suit"],
  ["Vladimir Putin", "a stern-looking older man in a dark suit"],
  ["Elon Musk", "a tech entrepreneur in a dark casual outfit"],
  ["Kim Jong Un", "an East Asian leader in a dark Mao suit"],
  ["Shinzo Abe", "a Japanese politician in a dark suit with glasses"],
  ["Fumio Kishida", "a Japanese politician in a dark suit with glasses"],
  ["Kishida", "a Japanese politician in a dark suit with glasses"],
  ["Yoon Suk Yeol", "a Korean politician in a dark suit"],
  ["윤석열", "a Korean politician in a dark suit"],
  ["Moon Jae-in", "a Korean politician with gray hair in a dark suit"],
  ["Park Geun-hye", "a Korean female politician in formal attire"],
  ["Zelenskyy", "a middle-aged man in an olive green military shirt"],

  // 연예인/셀럽 (필요 시 추가)
  ["Taylor Swift", "a young blonde woman in an elegant outfit"],
  ["BTS", "a group of young Korean men in stylish outfits"]
];
