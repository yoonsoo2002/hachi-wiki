// 하치와레 말풍선 문구. 기본은 다정하고 차분한 반말이다.
// 말버릇("~라는 거!?", "어떻게든 돼라~!")은 가끔만 섞는다.

const LINES = {
  welcome: [
    '어서 와. 예시 노트를 넣어 뒀어. 카드를 끌어 봐.',
    '왔구나. 오늘은 뭘 배웠어? 왼쪽에 적어 보자.',
  ],
  back: [
    '다시 왔구나. 이어서 해 보자.',
    '어서 와. 어제 적은 거 기억나?',
  ],
  save: [
    '저장했어. 오늘도 하나 배웠네.',
    '잘 적었다. 히히, 다행이다.',
    '저장 완료. 천천히 해도 괜찮아.',
  ],
  newNote: [
    '새 노트가 생겼어. 뭐부터 적을까?',
    '빈 카드 하나 놓았어. 생각나는 대로 적어 보자.',
  ],
  connect: [
    '둘이 이어졌다. 히히, 지도가 커졌어.',
    '연결했어. 이렇게 이어지는 거였구나.',
    '이어졌다는 거!? 좋다~',
  ],
  folderIn: [
    "'{name}' 폴더에 넣었어. 친구가 생겼네.",
    "'{name}' 폴더로 옮겼어. 같은 주제끼리 모였다.",
  ],
  folderNew: [
    '폴더를 만들었어. 같은 주제 노트를 넣어 봐.',
  ],
  duplicate: [
    '이 둘은 벌써 이어져 있어.',
  ],
  self: [
    '자기 자신이랑은 이을 수 없어… 다른 카드에 놓아 줘.',
  ],
  delete: [
    '지웠어. 괜찮아, 다시 쓰면 돼.',
  ],
  import: [
    '불러왔어. 지도가 다시 펼쳐졌다.',
  ],
  export: [
    '파일로 저장했어. 잘 보관해 줘.',
  ],
  importError: [
    '음… 이 파일은 못 읽겠어. 하치위키에서 내보낸 파일인지 봐 줄래?',
  ],
};

export function hachiLine(event, vars = {}, pick = Math.random) {
  const list = LINES[event];
  if (!list) return '';
  const line = list[Math.floor(pick() * list.length) % list.length];
  return line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const HACHI_EVENTS = Object.keys(LINES);
