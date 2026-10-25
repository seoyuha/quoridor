/* 6학년 영어 단원별 기본 문제 (교과서 10·11·12단원 내용 기반)
   quiz: { text, options[5], answer(0~4) }   speak: { text, meaning } */
const q = (text, options, answer) => ({ text, options, answer });
const s = (text, meaning) => ({ text, meaning });

const UNITS = {
  u10: {
    no: 10, title: "I’d Like to Have the Fruit Salad", topic: '음식 주문하고 맛 표현하기',
    quiz: [
      q('“무엇을 드시겠어요?”를 영어로 하면?', ['What would you like to have?', 'What do you like?', 'Where would you like to go?', 'How’s the food?', 'What’s this?'], 0),
      q('What would you like to have? 에 알맞은 대답은?', ['It’s sweet.', 'I’d like to have the steak.', 'I like summer.', 'Yes, I do.', 'It’s 8,000 won.'], 1),
      q('I’d like to의 I’d는 무엇의 줄임말일까요?', ['I do', 'I did', 'I would', 'I had', 'I am'], 2),
      q('“나는 레몬주스를 먹고 싶어요.”를 영어로 하면?', ['I like lemon juice.', 'I have lemon juice.', 'Do you like lemon juice?', 'I’d like to have some lemon juice.', 'It’s lemon juice.'], 3),
      q('How’s the food? 의 뜻은?', ['음식이 어디 있나요?', '음식은 얼마인가요?', '어떤 음식을 좋아하나요?', '음식을 주문할까요?', '음식 맛이 어때요?'], 4),
      q('레몬주스의 맛을 알맞게 표현한 것은?', ['It’s sour.', 'It’s salty.', 'It’s hot.', 'It’s cold.', 'It’s tall.'], 0),
      q('떡볶이를 먹고 “매워요!”라고 할 때 알맞은 말은?', ['It’s sweet.', 'It’s hot.', 'It’s sour.', 'It’s salty.', 'It’s big.'], 1),
      q('아이스크림이나 케이크의 맛으로 가장 알맞은 것은?', ['salty', 'sour', 'sweet', 'hot', 'fast'], 2),
      q('salty 의 뜻은?', ['단', '신', '매운', '짠', '쓴'], 3),
      q('sour 의 뜻은?', ['단', '매운', '짠', '뜨거운', '신'], 4),
      q('delicious 의 뜻은?', ['맛있는', '뜨거운', '건강한', '아름다운', '배고픈'], 0),
      q('빈칸에 알맞은 말은? “What ___ you like to have?”', ['do', 'would', 'are', 'is', 'can'], 1),
      q('빈칸에 알맞은 말은? “I’d like to have ___ fruit salad.”', ['a', 'some', 'the', 'an', 'it'], 2),
      q('“How’s the juice?”에 알맞은 대답은?', ['I’d like to have juice.', 'Yes, I do.', 'It’s 6,000 won.', 'It’s sour.', 'Sounds good.'], 3),
      q('“채소”를 뜻하는 영어 단어는?', ['egg', 'restaurant', 'meat', 'cheese', 'vegetable'], 4),
      q('restaurant 의 뜻은?', ['식당', '시장', '학교', '공원', '부엌'], 0),
      q('Tim의 가족이 한국에서 간 곳은?', ['a pizza restaurant', 'a Korean restaurant', 'a school', 'a park', 'a market'], 1),
      q('비빔밥에 들어 있다고 한 것은?', ['cheese and meat', 'noodles and fish', 'vegetables and an egg', 'rice cake and sugar', 'lemon and kiwi'], 2),
      q('Tim은 식혜(sikhye)를 마시고 뭐라고 했나요?', ['It’s too hot.', 'It’s salty.', 'It’s sour.', 'It’s sweet. I love sikhye.', 'I don’t like it.'], 3),
      q('피자를 소개한 글: “It is from ___.” 빈칸에 알맞은 나라는?', ['Korea', 'China', 'France', 'Japan', 'Italy'], 4),
      q('피자를 소개한 글에서 피자의 맛은?', ['It is salty, but delicious.', 'It is sour and sweet.', 'It is too hot.', 'It is not delicious.', 'It is cold.'], 0),
      q('“단 – 신”을 영어로 바르게 짝지은 것은?', ['hot – salty', 'sweet – sour', 'salty – hot', 'sour – sweet', 'sweet – hot'], 1),
      q('대화 순서로 알맞은 것은? ⓐ It’s delicious. ⓑ What would you like to have? ⓒ How’s the food? ⓓ I’d like to have the spaghetti.', ['ⓐ-ⓑ-ⓒ-ⓓ', 'ⓒ-ⓐ-ⓑ-ⓓ', 'ⓑ-ⓓ-ⓒ-ⓐ', 'ⓓ-ⓑ-ⓐ-ⓒ', 'ⓑ-ⓐ-ⓓ-ⓒ'], 2),
      q('“그건 너무 매워요.”를 영어로 하면?', ['It’s so sweet.', 'It’s very sour.', 'It’s salty.', 'It’s too hot.', 'It’s delicious.'], 3)
    ],
    speak: [
      s('What would you like to have?', '무엇을 드시겠어요?'),
      s('I’d like to have the fruit salad.', '과일 샐러드를 먹고 싶어요.'),
      s('I’d like to have some lemon juice.', '레몬주스를 마시고 싶어요.'),
      s('I’d like to have the steak.', '스테이크를 먹고 싶어요.'),
      s('I’d like to have the tteokbokki.', '떡볶이를 먹고 싶어요.'),
      s('I’d like to have some ice cream.', '아이스크림을 먹고 싶어요.'),
      s('How’s the food?', '음식 맛이 어때요?'),
      s('It’s sweet. It’s so sweet.', '달아요. 정말 달아요.'),
      s('It’s sour.', '셔요.'),
      s('It’s too hot.', '너무 매워요.'),
      s('It’s salty, but delicious.', '짜지만 맛있어요.'),
      s('How’s your bibimbap?', '비빔밥 맛이 어때요?'),
      s('It’s good for you.', '그건 몸에 좋아요.'),
      s('My favorite food is pizza.', '내가 가장 좋아하는 음식은 피자예요.'),
      s('Let’s go to a pizza restaurant together.', '함께 피자 식당에 가요.')
    ]
  },
  u11: {
    no: 11, title: 'Do You Know About Songpyeon?', topic: '알고 있는지 묻고 답하기 · 권유하기',
    quiz: [
      q('“너는 송편에 대해 알고 있니?”를 영어로 하면?', ['Do you know about songpyeon?', 'Do you like songpyeon?', 'What is songpyeon?', 'How about songpyeon?', 'Where is songpyeon?'], 0),
      q('Do you know about hanbok? 에 “아니, 몰라.”라고 답할 때 알맞은 말은?', ['Yes, I do.', 'No, I don’t.', 'No, it isn’t.', 'Sounds good.', 'I’m fine.'], 1),
      q('Do you know about kimchi? 에 “응, 알아.”라고 답할 때 알맞은 말은?', ['No, I don’t.', 'Yes, it is.', 'Yes, I do.', 'Sounds good.', 'Thank you.'], 2),
      q('How about making songpyeon? 의 뜻은?', ['송편은 어떻게 만드니?', '송편을 좋아하니?', '송편은 얼마니?', '송편을 만드는 게 어때?', '송편을 다 먹었니?'], 3),
      q('권유하는 말 “How about playing it?”에 알맞은 대답은?', ['No, I don’t.', 'It’s a game.', 'Yes, I do.', 'It’s delicious.', 'Sounds good.'], 4),
      q('gat 을 설명한 말로 알맞은 것은?', ['It’s a traditional Korean hat.', 'It’s a traditional Korean food.', 'It’s traditional Korean paper.', 'It’s a traditional Korean game.', 'It’s a traditional Korean house.'], 0),
      q('hanbok 을 설명한 말로 알맞은 것은?', ['It’s a traditional Korean game.', 'It’s traditional Korean clothing.', 'It’s a traditional Korean hat.', 'It’s traditional Korean paper.', 'It’s a traditional Korean food.'], 1),
      q('Hanji(한지)를 설명한 말로 알맞은 것은?', ['It’s a traditional Korean food.', 'It’s a traditional Korean hat.', 'It’s traditional Korean paper.', 'It’s a traditional Korean house.', 'It’s a traditional Korean game.'], 2),
      q('Tuho(투호)를 설명한 말로 알맞은 것은?', ['It’s traditional Korean clothing.', 'It’s a traditional Korean food.', 'It’s traditional Korean paper.', 'It’s a traditional Korean game.', 'It’s a traditional Korean hat.'], 3),
      q('hanok(한옥)을 설명한 말로 알맞은 것은?', ['It’s a traditional Korean food.', 'It’s a traditional Korean game.', 'It’s a traditional Korean hat.', 'It’s traditional Korean clothing.', 'It’s a traditional Korean house.'], 4),
      q('“전통적인”을 뜻하는 영어 단어는?', ['traditional', 'delicious', 'beautiful', 'difficult', 'favorite'], 0),
      q('clothing 의 뜻은?', ['음식', '옷, 의류', '종이', '놀이', '모자'], 1),
      q('throw 의 뜻은?', ['잡다', '머무르다', '던지다', '입다', '만들다'], 2),
      q('catch 의 뜻은?', ['던지다', '입다', '머무르다', '잡다', '춤추다'], 3),
      q('stone 의 뜻은?', ['종이', '모자', '공', '구슬', '돌'], 4),
      q('“Let’s stay in a hanok.”에서 stay의 뜻은?', ['머무르다', '놀다', '만들다', '던지다', '입다'], 0),
      q('공기놀이(Gongginori)를 할 때 필요한 것은?', ['a board and yutgarak', 'five small stones', 'Hanji and glue', 'a ball and a bat', 'hanbok and gat'], 1),
      q('“How about trying it on?”은 무엇을 권할 때 알맞을까요?', ['송편 먹기', '윷놀이 하기', '갓이나 한복을 써 보기·입어 보기', '한지 사기', '김치 만들기'], 2),
      q('송편을 만들어 먹는 명절은?', ['Seollal', 'Christmas', 'Halloween', 'Chuseok', 'Children’s Day'], 3),
      q('한옥에 있는 “추운 날을 위한 것”은?', ['a hat', 'a stone', 'a game', 'paper', 'ondol'], 4),
      q('윷놀이(Yunnori)에 대한 설명으로 알맞은 것은?', ['We play it with the yutgarak and a board.', 'We eat it on Chuseok.', 'We wear it on Seollal.', 'People make it with paper.', 'It’s hot and sour.'], 0),
      q('“Do you know about tteokguk?” 떡국은 무엇일까요?', ['a traditional Korean game', 'a traditional Korean food', 'traditional Korean clothing', 'a traditional Korean house', 'traditional Korean paper'], 1),
      q('대화 순서로 알맞은 것은? ⓐ Sounds good. ⓑ Do you know about Tuho? ⓒ How about playing it? ⓓ Yes, I do. It’s a traditional Korean game.', ['ⓐ-ⓑ-ⓒ-ⓓ', 'ⓒ-ⓓ-ⓑ-ⓐ', 'ⓑ-ⓓ-ⓒ-ⓐ', 'ⓓ-ⓒ-ⓐ-ⓑ', 'ⓑ-ⓐ-ⓓ-ⓒ'], 2),
      q('빈칸에 알맞은 말은? “How about ___ hanbok?” (한복을 입어 보는 게 어때?)', ['make', 'play', 'eat', 'trying on', 'throw'], 3)
    ],
    speak: [
      s('Do you know about songpyeon?', '너는 송편에 대해 알고 있니?'),
      s('Yes, I do.', '응, 알아.'),
      s('No, I don’t.', '아니, 몰라.'),
      s('How about making songpyeon?', '송편을 만드는 게 어때?'),
      s('It’s a traditional Korean food.', '그것은 한국의 전통 음식이야.'),
      s('It’s a traditional Korean game.', '그것은 한국의 전통 놀이야.'),
      s('It’s traditional Korean clothing.', '그것은 한국의 전통 의상이야.'),
      s('It’s a traditional Korean hat.', '그것은 한국의 전통 모자야.'),
      s('Do you know about Hanji?', '너는 한지에 대해 알고 있니?'),
      s('How about trying it on?', '그것을 써 보는[입어 보는] 게 어때?'),
      s('How about playing it together?', '함께 그것을 하는 게 어때?'),
      s('Sounds good.', '좋아.'),
      s('Let’s stay in a hanok during the holiday.', '휴일 동안 한옥에서 지내자.'),
      s('You can play it with five small stones.', '작은 돌 다섯 개로 그것을 할 수 있어.'),
      s('We make and eat it on Chuseok.', '우리는 추석에 그것을 만들어 먹어.')
    ]
  },
  u12: {
    no: 12, title: 'We Should Save the World', topic: '의무 말하기 · 잊지 말아야 할 것 조언하기',
    quiz: [
      q('“우리는 세상을 지켜야 해.”를 영어로 하면?', ['We should save the world.', 'We can save the world.', 'We like the world.', 'Don’t save the world.', 'Let’s go to the world.'], 0),
      q('“불 끄는 것을 잊지 마.”를 영어로 하면?', ['Turn on the light.', 'Don’t forget to turn off the light.', 'Don’t turn off the light.', 'We should use the light.', 'Do you know about the light?'], 1),
      q('Don’t forget to ~ 는 어떤 뜻일까요?', ['~하지 마', '~할 수 있어', '~하는 것을 잊지 마', '~하는 게 어때?', '~를 알고 있니?'], 2),
      q('We should ~ 는 어떤 뜻일까요?', ['우리는 ~할 수 없어', '우리는 ~하고 싶어', '우리는 ~했어', '우리는 ~해야 해', '우리는 ~를 좋아해'], 3),
      q('recycle 의 뜻은?', ['다시 쓰다', '아끼다', '끄다', '버리다', '재활용하다'], 4),
      q('reuse paper 의 뜻은?', ['종이를 다시 쓰다', '종이를 버리다', '종이를 사다', '종이를 자르다', '종이를 만들다'], 0),
      q('“계단을 이용하는 것을 잊지 마.”를 영어로 하면?', ['Don’t use the stairs.', 'Don’t forget to use the stairs.', 'We should use a cup.', 'Use the elevator.', 'Turn off the stairs.'], 1),
      q('물을 아끼기 위해 손을 씻은 뒤 해야 할 말은?', ['Don’t forget to use a cup.', 'Don’t forget to turn off the light.', 'Don’t forget to turn off the water.', 'Don’t forget to reuse paper.', 'Don’t forget to use the stairs.'], 2),
      q('“We should save ___.” 엘리베이터 대신 계단을 이용하면 아끼는 것은?', ['water', 'paper', 'money', 'energy', 'food'], 3),
      q('“Don’t forget to use a cup.” 다음에 이어질 말로 알맞은 것은?', ['We should save energy.', 'We should use plastic bags.', 'Let’s throw away cans.', 'It’s delicious.', 'We should save water.'], 4),
      q('환경을 지키는 행동으로 알맞은 것은?', ['recycle cans and bottles', 'use plastic bags', 'throw away paper', 'turn on the light all day', 'leave the water running'], 0),
      q('“비닐봉지를 사용하지 마.”를 영어로 하면?', ['Use plastic bags.', 'Don’t use plastic bags.', 'Don’t forget to use plastic bags.', 'We should use plastic bags.', 'Recycle plastic bags.'], 1),
      q('빈칸에 알맞은 말은? “Don’t ___ to turn off the water.”', ['use', 'save', 'forget', 'should', 'reuse'], 2),
      q('빈칸에 알맞은 말은? “We ___ save the Earth.”', ['don’t', 'forget', 'like', 'should', 'are'], 3),
      q('“Don’t forget to reuse paper.”에 알맞은 대답은?', ['No, I don’t.', 'It’s sour.', 'Yes, I do.', 'It’s delicious.', 'Okay.'], 4),
      q('forest 의 뜻은?', ['숲', '바다', '목소리', '에너지', '지구'], 0),
      q('energy 의 뜻은?', ['물', '에너지', '전등', '계단', '종이'], 1),
      q('throw away 의 뜻은?', ['다시 쓰다', '끄다', '버리다', '아끼다', '씻다'], 2),
      q('글 “The Earth is too hot.”의 뜻은?', ['지구는 너무 추워요.', '지구는 아름다워요.', '지구는 아파요.', '지구는 너무 더워요.', '지구는 우리 집이에요.'], 3),
      q('글의 내용과 일치하는 것은?', ['We should use plastic bags.', 'Don’t save water.', 'Throw away cans and bottles.', 'Use paper cups every day.', 'The Earth is our home. We should save the Earth.'], 4),
      q('“Let’s wash quickly.”는 무엇을 아끼기 위한 말일까요?', ['water', 'paper', 'the forest', 'cans', 'bottles'], 0),
      q('9월 22일 ‘세계 차 없는 날’에 하면 좋은 행동은?', ['drive a car', 'ride a bike', 'use plastic bags', 'turn on the light', 'throw away bottles'], 1),
      q('대화 순서로 알맞은 것은? ⓐ Okay. We should save water. ⓑ Let’s wash our hands. ⓒ Don’t forget to turn off the water.', ['ⓐ-ⓑ-ⓒ', 'ⓒ-ⓐ-ⓑ', 'ⓑ-ⓒ-ⓐ', 'ⓐ-ⓒ-ⓑ', 'ⓒ-ⓑ-ⓐ'], 2),
      q('“종이컵 대신 컵을 쓰는 것을 잊지 마.”에 맞는 표현은?', ['Don’t forget to reuse paper.', 'Don’t forget to use the stairs.', 'Don’t use a cup.', 'Don’t forget to use a cup.', 'We should use paper cups.'], 3)
    ],
    speak: [
      s('We should save the world.', '우리는 세상을 지켜야 해.'),
      s('We should save energy.', '우리는 에너지를 아껴야 해.'),
      s('We should save water.', '우리는 물을 아껴야 해.'),
      s('Don’t forget to turn off the light.', '불 끄는 것을 잊지 마.'),
      s('Don’t forget to turn off the water.', '물 잠그는 것을 잊지 마.'),
      s('Don’t forget to use a cup.', '컵을 사용하는 것을 잊지 마.'),
      s('Don’t forget to use the stairs.', '계단을 이용하는 것을 잊지 마.'),
      s('Don’t forget to reuse paper.', '종이를 다시 쓰는 것을 잊지 마.'),
      s('Don’t forget to recycle cans and bottles.', '캔과 병을 재활용하는 것을 잊지 마.'),
      s('Don’t use plastic bags.', '비닐봉지를 사용하지 마.'),
      s('The Earth is our home.', '지구는 우리의 집이야.'),
      s('The Earth is sick.', '지구가 아파.'),
      s('Save the forest.', '숲을 지키자.'),
      s('Okay. We should save the world.', '알았어. 우리는 세상을 지켜야 해.'),
      s('We should ride a bike.', '우리는 자전거를 타야 해.')
    ]
  }
};
const UNIT_IDS = Object.keys(UNITS);
// 정답 위치 점검(개발용): 모든 문제의 보기는 5개, 정답 번호 0~4
for (const id of UNIT_IDS) for (const x of UNITS[id].quiz) if (x.options.length !== 5 || x.answer < 0 || x.answer > 4) throw new Error('잘못된 기본 문제: ' + x.text);
module.exports = { UNITS, UNIT_IDS };
