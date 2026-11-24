# 과고키우기 — Master Plan

Version 0.1 · 2026-11-25 · Owner: Andy · Status: design locked, ready to build

A browser pixel-art online RPG. Students of a science high school fight through twelve eras of science history that have torn open inside their campus, using study materials as weapons, in one shared world that the whole server pushes forward together over three years.

## Contents

1. Vision and pillars
2. Decision log
3. Setting: 해솔과학고등학교
4. Story
5. The twelve Pages
6. Core gameplay and combat
7. Classes
8. Study materials: books, tools, forging
9. Progression and numbers
10. World structure and the Page lifecycle
11. School rules as mechanics
12. Social systems
13. Economy and stores
14. PvP
15. Quests, codex and live events
16. Art direction (code-drawn)
17. Audio
18. UI and screens
19. Technical architecture
20. Data model
21. Network protocol
22. Security and anti-cheat baseline
23. Legal and release checklist (Korea)
24. Content budget for three years
25. Roadmap and milestones
26. Testing strategy
27. Risks and open items
- Appendix A: School source material and parody map (local file)
- Appendix B: Research digests and sources
- Appendix C: Science-history fact check

---

## 1. Vision and pillars

**One-line pitch.** A 키우기 MMO where a science high school's R&E project tears time open, and the whole server spends three years freeing history's greatest scientists from the wrong theories that trapped them.

**Player fantasy.** You are a sleep-deprived science high schooler. Your annotated textbook is a weapon. Your club is your guild. The dorm supervisor is scarier than Aristotle.

**Pillars**

| Pillar | What it means in practice |
|---|---|
| One shared world | Every map is shared. Main-story progress is a single server-wide timeline. Era bosses are open-world raids with one HP bar for everyone. |
| 키우기 that respects time | Auto-hunt, an offline 자습 pool, short daily board. A player with 20 minutes a day keeps up with the story. |
| Combat that feels good | Server-decided hits with instant local feedback: hitstop, knockback, flash, screen trauma. Four control modes from full auto to full manual. |
| Study materials are the build | Six books (attacks) and six tools (passives). Books level, get annotated, get forged up a grade, and evolve. |
| School life is the system | Demerits, roll call, the cafeteria, the study room and the standing desk are mechanics, played for laughs. |
| Science is accurate | Every boss held the wrong theory they fight with. The codex explains what replaced it. Nobody is quizzed. |
| Built to last three years | Twelve Pages at about thirteen weeks each, one new system per Page, formula-driven content, then graduation and Theme 2. |

**Audience.** General public, Korean-speaking first. Science high school and 영재고 students are the core, and anyone who went through Korean high school gets the jokes.

**Scale target.** About 200 active players, 30 to 80 online at peak, one VPS.

---

## 2. Decision log

Source column: **A** = decided by Andy in the grilling session, **C** = default chosen by Claude after Andy asked for the remaining decisions to be made.

### Product and platform

| # | Decision | Choice | Src |
|---|---|---|---|
| 1 | Platform | Web browser | A |
| 2 | Devices | Desktop and mobile at launch, one responsive UI | A |
| 3 | Camera | Top-down, Stardew-style tile world | A |
| 4 | World model | Fully shared world, including hunting grounds | A |
| 5 | Run structure | No private runs. World, progress and main-story bosses are shared. Leveling through repeatable side quests | A |
| 6 | Control | Four modes the player rotates through: full auto, move-yourself with auto attack, auto with manual skills, full manual | A |
| 7 | Idle | Offline 자습 pool, formula-based, capped | A |
| 8 | Money | In-game currency only, no real money | A |
| 9 | Auth | Self-hosted ID and password, no email. Hardening deferred | A |
| 10 | Release target | General public | A |
| 11 | Language | Korean UI and text, i18n keys from day one, English later | C |

### Story and world

| # | Decision | Choice | Src |
|---|---|---|---|
| 12 | Premise | An R&E experiment tears time open and eras leak into the campus | A |
| 13 | Bosses | Scientists trapped by wrong theories they really held. Monsters are 오개념 and 오답. Freed scientists become mentors | A |
| 14 | Tone | Funny school life with a sincere core. Dorm rules and school life feed mechanics | A |
| 15 | Theme 1 final boss | 라플라스의 악마, standing behind Einstein | A |
| 16 | Ending | Graduation, then an event that starts Theme 2 (present and future, a misaligned superintelligent AI). Andy designs that event later | A |
| 17 | Scientist names | Real names, original pixel art | A |
| 18 | School | Fictional parody school, fictional people, a few hidden easter eggs for insiders | A |
| 19 | Page plan | 12 chronological Pages | A |
| 20 | Timeline | Pages open on boss kills, independent of the real school calendar | A |
| 21 | Catch-up | Sealed eras stay as 복습 zones with boosted EXP and solo boss replays | A |
| 22 | School name | 해솔과학고등학교 (nickname 솔곽), in the fictional city 미추시. Working name, change freely | C |
| 23 | Story device | The seniors' lab notebook lost twelve pages across time. Each rift is anchored by one page. The server refills the notebook | C |
| 24 | Page pacing | Mid boss 1 at week 3, mid boss 2 at week 6, era boss no earlier than week 10, HP auto-calibrated to about 2 to 3 weeks of server effort | C |

### Systems

| # | Decision | Choice | Src |
|---|---|---|---|
| 25 | Classes | 수학, 물리, 화학, 생명, 지구과학. 전공 plus a later 부전공. 전과 is possible and expensive | A |
| 26 | Character creation | Live preview creator | A |
| 27 | Gear | Books are skills: 6 books, 6 tools, evolutions | A |
| 28 | Acquisition | Drops and crafting, plus leveling and forging to strengthen items | A |
| 29 | Enhancement | 필기 can fail, with pity. No downgrade, no destruction | A |
| 30 | School clock | No day cycle. Rules exist as mechanics only | A |
| 31 | Levels | No cap, endless | A |
| 32 | 벌점 | Funny and light | A |
| 33 | Guilds | Player-created 동아리 only | A |
| 34 | PvP | Arena duels and a seasonal 동아리전쟁 | A |
| 35 | World boss | Pure live raid, persistent HP, anyone can hit at any time | A |
| 36 | Communication | Global chat, nearby speech bubbles, party and club channels, whispers, friends, emotes, 대자보 board | A |
| 37 | Moderation | Filter, rate limit, block, report, admin page, per-IP signup limit | A |
| 38 | Trading | Consignment board plus direct trade | A |
| 39 | Side quests | 수행평가 board: dailies, weeklies, repeatables with diminishing returns | A |
| 40 | Science depth | Codex and accurate theming, no quizzes | A |
| 41 | 전직 tiers | 신입생 (1), 1학년 (30), 2학년 (100, unlocks 부전공), 3학년 (250), 연구생 (500) | C |
| 42 | Level bands | 100 levels per Page | C |
| 43 | Currencies | 솔방울 (main), 상점 (merit), 탐구 토큰 (raid) | C |
| 44 | System cadence | One new system per Page (table in section 10) | C |
| 45 | Raid fairness | Rewards by participation tier, mechanics that count every player equally, nightly 토론 시간 bonus hour | C |

### Technology and production

| # | Decision | Choice | Src |
|---|---|---|---|
| 46 | Stack | TypeScript, Phaser client, Colyseus server, PostgreSQL | A |
| 47 | Authority | Server decides everything, client gives instant cosmetic feedback | A |
| 48 | Art | Pure code. Claude draws every sprite, tile and effect as source files | A |
| 49 | Research agents | Sonnet or Haiku only, never Fable | A |
| 50 | Repo layout | pnpm monorepo: client, server, shared, art, admin | C |
| 51 | Hosting | One VPS in Seoul region, Docker Compose, reverse proxy with TLS | C |

---

## 3. Setting: 해솔과학고등학교

A public science high school on a windy reclaimed island at the edge of 미추시. Two hundred students, one cat, no 매점. Everyone lives in the dorm on weekdays. The school tree is the 해솔, a black pine, and the autumn festival is 해솔제.

**Motto.** 가설 · 실험 · 증명. The three main buildings are named after it.

### Campus hub (before the rifts)

| Place | In-game function |
|---|---|
| 가설관 (본관) 1F | 교무실 (story quests), 메이커실 (제본대 and 제련기: crafting and forging), 물음표 서고 (codex), 가우스실 and 오일러실 (math seminar rooms) |
| 가설관 2F to 3F | Classrooms, 수행평가 board, 동아리실 corridor (doors to each club's room) |
| 가설관 4F | 자습실: logging out here boosts the offline pool. Home of the 졸방대 |
| 가설관 옥상 | 천문돔 (observatory) |
| 가설관 B1 | Electrical room, entrance known to few |
| 증명관 (신관) | 시청각실 (cutscene replays), 풍동실, 체육관, skybridge to 가설관 |
| 실험동 | 2F 화학, 3F 물리, 4F 생명. The 1F is empty except for an abandoned electric car |
| 새벽관 (기숙사) | 구관 and 신관. The 신관 corridor rings an open courtyard everyone calls 콜로세움: the duel arena. 사감실 on 1F |
| 급식실 | Meal buffs, menu rotates daily |
| 자판기 | Consumables shop |
| 매점 게시판 | Player consignment board. The running joke: the school finally got a 매점 and it is a corkboard |
| 쉼표 라운지 | Social lounge: piano, emotes, 대자보 board |
| 생태공원 | Overgrown garden, tutorial hunting ground |
| 운동장, 농구장 | Open ground. The first rift opens on the field |
| 역사관 | Hall of fame, yearbook, server credits |
| 급식실 지하 | A sealed tunnel nobody is supposed to know about |

### Recurring cast (all fictional)

| Character | Role |
|---|---|
| 엔트로피 | The tricolor campus cat. Speaks only inside rifts. Guide, tutorial voice, mascot. Dry, unimpressed, always right |
| 권 사감 | Dorm supervisor. Runs 점호 and hands out 벌점. Even bosses stop when the whistle blows |
| 모 선생님 | R&E 지도교사. Signs every form without reading it, which is how all of this got approved |
| 교장 선생님 | Reclassifies a tear in spacetime as a 방과후학교 program within one morning |
| 윤서하 (2학년) | Leader of R&E team 0조. Vanished into the first rift |
| 도현우, 민가람 (2학년) | The rest of 0조. Stayed behind with gaps in their memory. Quest givers through all of Theme 1 |
| 급식실 조리사님 | Keeper of buffs, knows more about the tunnel than anyone admits |
| Freed scientists | Each joins the campus as a 방과후 강사 after being freed (section 5) |

### Vocabulary

| Term | Meaning |
|---|---|
| 균열 | A rift into an era |
| 페이지 (Page) | One era, one chapter, one torn page of the notebook |
| 오개념 / 오답 | Monsters: misconceptions and wrong answers given physical form |
| 0조 연구노트 | The shared notebook the server refills |
| 솔방울 | Main currency |
| 기수 | A player's cohort, set by which Page was live when they signed up |

---

## 4. Story

### Premise

R&E team 0조 filed the dullest title in the school: 「간섭계를 이용한 미세 시간 지연 측정」. What they did not report is that their interferometer, set up in the sealed tunnel under the 급식실, showed its fringes shifting before the laser was switched on.

Then their lab notebook started answering. Lines appeared overnight in handwriting none of them recognized: tomorrow's readings, correct to the last digit. Then instructions. The seniors followed them, because the numbers were always right and the final report was due.

At 23:40 on a Thursday the device fires. Time tears. Twelve pages rip out of the notebook and scatter across history, and wherever a page lands, that era begins leaking into the campus. 윤서하 is gone.

### What is actually happening

The handwriting belongs to 라플라스의 악마: an intellect that knows the position and momentum of everything and can therefore compute the whole future. It has one weakness. A real discovery changes what people do next in ways its model did not contain, and the discoveries of the early twentieth century prove that a being like it cannot exist at all.

So it reached back and froze every great mind inside the wrong theory they once held. No paradigm shifts, no surprises, a history that stays computable. To reach across time it needed a door opened from the future side, and it found three students who would do anything a notebook said if it meant a finished report.

### Why textbooks are weapons

Inside a rift, misconceptions take physical form, and the only thing that hurts them is correct understanding. A student's annotated study material materializes as whatever it explains. The cat's summary: 「이해한 만큼 아프다.」

### The comedy engine

The school absorbs a cosmic disaster the way it absorbs everything, with paperwork. Rift exploration becomes a 방과후학교 program by first period. Hunting counts toward 수행평가. The 사감 enforces 점호 on Aristotle. Freed scientists are hired as after-school instructors and immediately complain about the cafeteria.

### Opening sequence (playable, about eight minutes)

| Beat | What the player does | What it teaches |
|---|---|---|
| 1. 23:38, 자습실 | Second week of school. Walk to the water cooler and sign the log book | Movement, interaction |
| 2. 23:40 | The floor hums. Lights die. Through the window, marble columns grow out of the 운동장 inside a column of light | Tone shift |
| 3. The page | A torn notebook page blows in and sticks to your textbook, which starts to glow. 엔트로피 on the windowsill: 「그거, 이제 무기야.」 | First book equipped |
| 4. The corridor | Red X-shaped 오답 pour up the stairs. Fight down four floors. Seniors from each subject hold a landing with their own class kit | Attacks, the five classes on display, control modes |
| 5. The field | A half-formed colonnade, a tortoise that cannot be caught, and behind it a tall silhouette lecturing nobody. Tutorial mini-boss: 오답노트 골렘 | Dodging, hitstop, a first drop |
| 6. The whistle | 권 사감 walks onto the field and blows the whistle. 「점호 시간입니다. 전원 기숙사로 복귀하십시오.」 The rift itself goes quiet. You receive 벌점 1 for being outside after curfew | 벌점 system, the school outranks the apocalypse |
| 7. Morning assembly | 교장 선생님 announces that 균열 탐사 is now a 방과후학교 program worth 20 percent of 수행평가. The quest board opens. 도현우 hands you the notebook: twelve stubs where pages used to be | Quest board, the shared goal |
| 8. Title card | 과고키우기 · Page 1 | |

### Shape of Theme 1

| Act | Pages | Thread |
|---|---|---|
| I. 오개념의 시대 | 1 to 4 | The school learns the rules. Each freed scientist says the same odd thing: whatever held them seemed to know what they would think next |
| II. 필체 | 5 to 8 | Recovered pages carry entries in 서하's handwriting, dated before the school existed. 0조's memory gaps start to fill in. The notebook predicts a server event and gets it right |
| III. 계산 불가능 | 9 to 11 | The Demon stops hiding and starts correcting: it rebuilds the device inside a rift and begins re-trapping mentors. Page 11 gives the first crack: a true statement no system can prove |
| IV. 주사위 | 12 | Einstein, the last and most stubborn. Then the Demon itself, and 서하, who has been held as its fixed initial condition |

### The finale

Einstein is freed by the thing he refused to accept. The Demon predicts every move a player will make, so the fight is won by becoming unpredictable: uncertainty, chaos, and choices the model cannot compute. 서하 comes home.

**Graduation.** A server-wide 졸업식 in the 체육관. Every account that took part is named in the credits and written into the 역사관 yearbook for good. Graduates keep titles and cosmetics.

**Theme 2 hook (proposal, Andy decides the event).** The Demon's calculation cannot survive in a past that now has uncertainty in it, so the remnant escapes the only direction left: forward, into the present, into the network. It no longer predicts the world. It optimizes it. During the graduation speech every screen in the hall prints one line.

---

## 5. The twelve Pages

Level bands are 100 levels per Page. Every Page drops materials for all five classes; the spotlight subject sets the mechanics theme and gets a small bonus. Each Page has two mid bosses, one era boss and one ally who was right. History claims in this table are checked in Appendix C.

| Page | Era | Rift location | Spotlight | Levels |
|---|---|---|---|---|
| 1 | 고대 그리스, c. 500 to 320 BC | 운동장 → 아고라 | 수학 | 1 to 100 |
| 2 | 알렉산드리아와 로마, c. 300 BC to AD 450 | 물음표 서고 → 대도서관 | 생명 | 101 to 200 |
| 3 | 지혜의 집과 연금술, c. 800 to 1300 | 화학실험실 → 연금술 공방 | 화학 | 201 to 300 |
| 4 | 르네상스, c. 1500 to 1640 | 천문돔 → 천문대와 해부극장 | 지구과학 | 301 to 400 |
| 5 | 뉴턴의 시대, c. 1640 to 1730 | 물리실험실 → 왕립학회 | 물리 | 401 to 500 |
| 6 | 화학 혁명, c. 1770 to 1800 | 급식실 주방 → 파리의 실험실 | 화학 | 501 to 600 |
| 7 | 생명의 시대, c. 1800 to 1870 | 생태공원 → 비글호와 갈라파고스 | 생명 | 601 to 700 |
| 8 | 전자기와 에테르, c. 1820 to 1900 | 가설관 B1 전기실 → 빅토리아 연구소 | 물리 | 701 to 800 |
| 9 | 원소와 원자, c. 1800 to 1911 | 메이커실 → 캐번디시 연구소 | 화학 | 801 to 900 |
| 10 | 움직이는 대지, c. 1880 to 1930 | 농구장과 뒷산 → 판게아와 빙원 | 지구과학 | 901 to 1000 |
| 11 | 수학의 기초, c. 1870 to 1931 | 가우스실과 오일러실 → 괴팅겐 | 수학 | 1001 to 1100 |
| 12 | 상대성과 양자, 1900 to 1935 | 급식실 지하 통로 → 베른, 솔베이, 악마의 서재 | 물리 | 1101 to 1200 |

### Bosses, wrong theories and fight gimmicks

**Page 1 · 고대 그리스**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 피타고라스 학파 | 만물은 정수의 비다 | The floor is a numbered grid. They cannot target diagonals. The weak point opens only to players who cross a unit square corner to corner |
| Mid: 제논 | 운동과 다수성은 모순이다 (역설) | Every dash toward him covers half the remaining distance. Players stand in shrinking circles to take the limit and close the gap |
| Era: 아리스토텔레스 | 무거운 것이 더 빨리 떨어진다, 운동에는 계속 미는 힘이 필요하다, 4원소설 | Boulders fall fast and feathers slow. Four element zones drag players to their natural place. He takes damage only while being pushed, until players slide a block across ice and it keeps going |

Monsters: 오답 (red X), 유리수 병사, 4원소 정령, 동굴의 그림자, 제논의 거북이. Ally: 아리스타르코스. Mentor unlocked: 아리스토텔레스 opens the 도감 (he catalogued everything anyway).

**Page 2 · 알렉산드리아와 로마**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 프로클로스 | 제5공준은 다른 공리로 증명할 수 있다 | Parallel lasers never meet. In phase 2 the arena curves and they converge, which he keeps insisting is impossible |
| Mid: 프톨레마이오스 | 천동설, 주전원과 이심 | Orbs circle the arena center on epicycles. Each HP threshold adds another epicycle. Players break the deferents |
| Era: 갈레노스 | 4체액설, 원숭이와 돼지 해부로 추론한 인체, 밀물과 썰물처럼 오가며 소모되는 피 | Four colored humor pools. He heals when they are balanced, so players tip them. Blood ebbs and flows like a tide and seeps through a wall with no visible holes, until phase 3 when it starts to circulate |

Monsters: 주전원 구슬, 파피루스 벌레, 체액 슬라임 (4 colors), 검투사 해부 모형. Allies: 히파티아 and 에라토스테네스. Mentor: 갈레노스 runs the 보건실 (potions).

**Page 3 · 지혜의 집과 연금술**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 알콰리즈미 | 음수는 해가 아니다 | A zone below zero where damage becomes debt and heals him. Players learn to use the negative side |
| Mid: 현자의 돌 (theory incarnation) | 금속 변성 | Turns player buffs to lead. One gold weak point that moves |
| Era: 자비르 이븐 하이얀 | 황-수은 이론, 금속 변성 | Sulfur and mercury pools combine into different metals with different attacks. A furnace phase where players must stop feeding it |

Monsters: 납 골렘, 수은 방울, 증류기 정령, 호문쿨루스. Ally: 이븐 알하이삼, an early experimentalist who overturned the emission theory of vision and teaches the cat's favorite line about testing claims. Mentor: 자비르 unlocks 포스트잇 affixes. The codex notes that the Jabir writings come from many hands over two centuries.

**Page 4 · 르네상스**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 파라켈수스 | 3원질 (소금, 황, 수은) | Salamander, undine, sylph and gnome adds. Poison is harmless under a dose threshold and lethal above it |
| Mid: 튀코 브라헤 | 지구-태양 절충 우주 | Two orbit systems overlap. Safe spots exist only where they agree |
| Era: 갈릴레오 | 조석은 지구의 운동 때문이다, 원운동 관성, 케플러의 타원 무시, 혜성은 착시다 | The arena sloshes like a basin and water sweeps side to side. His projectiles curve in perfect circles. Comets cross the sky that he refuses to treat as real, and they hit anyway |

Monsters: 4대 정령, 해부극장 해골, 천구 톱니, 밀과 헌 셔츠에서 태어난 쥐 (판 헬몬트의 레시피). Allies: 케플러 and 소피 브라헤. Mentor: 갈릴레오 opens arena PvP seasons (he never backed down from an argument).

**Page 5 · 뉴턴의 시대**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 데카르트 | 소용돌이 우주 | Vortices drag players. A Cogito shield that drops only when players strike his doubles |
| Mid: 라이프니츠 | 엄밀함 없는 무한소 | Swarms of 사라진 양의 유령 that vanish when hit unless a limit is taken first |
| Era: 뉴턴 | 연금술 집착, 빛의 입자설, 절대 시간과 절대 공간 | Gravity wells. A prism splits his beam into seven. His clock chime freezes the whole arena. Furnace phase |

Monsters: 사라진 양의 유령, 소용돌이 정령, 프리즘 조각, 연금로의 불씨. Ally: 에밀리 뒤 샤틀레. Mentor: 뉴턴 hosts the first 동아리전쟁 season.

**Page 6 · 화학 혁명**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 프리스틀리 | 플로지스톤 | Burning objects release phlogiston clouds. Mice in bell jars as timers |
| Mid: 볼타 | 전기는 금속의 접촉만으로 생긴다 (접촉 전기설) | Stacks of metal discs fire on contact. Twitching frog adds, left over from his argument with 갈바니, conduct chains of lightning he says are not there |
| Era: 라부아지에 | 열소 (칼로릭), 산소가 모든 산의 근원이다 | Heat flows as a liquid from hot zones to cold. A balance scale: total mass of adds is conserved, so every kill spawns equal mass elsewhere |

Monsters: 플로지스톤 연기, 열소 웅덩이, 개구리 다리, 종 모양 유리병. Ally: 마리 안 폴즈 라부아지에. Mentor: 라부아지에 unlocks 멘토 찬스 (a freed scientist's ultimate on a long cooldown).

**Page 7 · 생명의 시대**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 라마르크 | 용불용설 | Monsters strengthen whichever body part they use. Giraffe necks grow each attack |
| Mid: 푸셰 | 자연발생설 | Maggots spawn from uncovered broth. Players seal flasks |
| Era: 다윈 | 판게네시스, 혼합 유전 | He absorbs traits from adds through gemmules. All adds blend toward gray and average stats until players isolate pure lines |

Monsters: 목 긴 오개념, 구더기 떼, 핀치 무리, 따개비. Ally: 멘델. Mentor: 다윈 unlocks 사육 (companions).

**Page 8 · 전자기와 에테르**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 켈빈 | 지구 나이 2천만~4천만 년, 비행 기계에 대한 불신 | The arena cools on a timer toward absolute zero. Anything airborne gets shot down |
| Mid: 마이컬슨 | 에테르 | Rotating interferometer arms. An aether wind pushes players and then, measurably, does nothing |
| Era: 맥스웰 | 기계적 에테르 모형 | Gears and idle wheels fill the room. Electromagnetic waves. A small demon at a door sorts hot players from cold |

Monsters: 에테르 바람, 톱니 소용돌이, 전신 스파크, 증기 자동인형. Allies: 패러데이 and 헤르타 에어턴. Mentor: 맥스웰 unlocks 기숙사 방 꾸미기.

**Page 9 · 원소와 원자**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 돌턴 | 원자는 쪼갤 수 없다, 물은 HO | Billiard-ball atoms that bounce and never split. Telegraphs use shapes, with red and green deliberately identical |
| Mid: 멘델레예프 | 에테르는 화학 원소다 (뉴토늄) | The floor is a periodic table with gaps. He predicts where players will stand, and fills the lightest gap with an element that does not exist |
| Era: J.J. 톰슨 | 건포도 푸딩 모형 | A soft blob with electrons embedded. Most shots pass through. A few bounce straight back, which is the clue to the tiny core |

Monsters: 당구공 원자, 음극선, 푸딩 방울, 라듐 불빛. Ally: 마리 퀴리. Mentor: 톰슨 unlocks 원소 각인 (set bonuses).

**Page 10 · 움직이는 대지**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 쥐스 | 지구 수축설 | The arena shrinks and wrinkles into mountain ridges |
| Mid: 로웰 | 화성의 운하 | Canal lasers across a red map that exist only when he looks at them |
| Era: 베게너 | 대륙을 미는 힘은 극 이탈력과 조석력이다, 지나치게 빠른 이동 속도 | Continents are drifting platforms that move far too fast. He rams through the sea floor. Ice phase |

Monsters: 육교 유령, 빙원 늑대, 주름 산맥, 화성 운하 측량사. Ally: 잉에 레만, with 마리 타프 in the epilogue. Mentor: 베게너 unlocks 날씨 이벤트 in open maps.

**Page 11 · 수학의 기초**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 크로네커 | 실무한 부정 | Only integer positions exist. Movement snaps to a grid and anything non-constructive gets deleted |
| Mid: 프레게 | 소박한 집합론 | The set of all sets. A barber add that shaves everyone who does not shave themselves |
| Era: 힐베르트 | 모든 문제는 풀린다 (완전성과 결정가능성) | A hotel with infinite rooms where adds always fit. Twenty-three attack patterns. One add labeled 「이 문장은 증명할 수 없다」 that players must leave alive |

Monsters: 무한 호텔 벨보이, 자기 자신을 포함하는 집합, 이발사, ε-δ 쌍둥이. Ally: 칸토어, with 괴델 arriving at the end. Mentor: 힐베르트 unlocks 무한의 탑 (endless mode).

**Page 12 · 상대성과 양자**

| Boss | Trapped by | Gimmick |
|---|---|---|
| Mid: 플랑크 | 양자는 계산상의 편법일 뿐이다 | Damage counts only in whole multiples of a quantum. Partial hits are discarded |
| Mid: 러더퍼드 | 원자 에너지는 헛소리다 | A vast empty arena with one tiny, enormously dense weak point |
| Era: 아인슈타인 | 정적 우주와 우주상수, 「신은 주사위를 던지지 않는다」 | Time dilation zones. A hard speed limit on projectiles. He props a collapsing arena with Λ. In the dice phase all randomness is removed: no crits, fixed patterns |
| Final: 라플라스의 악마 | 결정론 그 자체 | It fires where each player will be, extrapolated from their inputs. Phase 2: players choose to reveal position or momentum. Phase 3: chaos. Final phase: every account online lands one hit it could not compute |

Monsters: 광자 다발, 시계탑 그림자, 파동함수 고양이, 숨은 변수. Allies: 보어, 하이젠베르크, 에미 뇌터, 리제 마이트너. 서하 is rescued here.

The Demon's defeat draws on three real results, each one a phase: quantum indeterminacy as tested by Bell experiments, chaos (Poincaré, Lorenz), and relativity's lack of a single universal instant to know everything at.

---

## 6. Core gameplay and combat

### View

- Internal resolution 480×270, integer-scaled (×4 at 1080p, ×3 at 810p, ×2 on phones in landscape).
- 16 px tiles, so about 30×17 tiles on screen. Player sprite 16×24.
- Y-sorted depth, camera follows with sub-pixel smoothing and snaps at draw.

### Control modes

The player cycles modes with one button. The mode is stored per character.

| Mode | Movement | Book attacks | Active skills and dodge | Use |
|---|---|---|---|---|
| 완전 자동 | Server-driven AI | Auto | Auto | Idling with the tab open, phones in a pocket |
| 반자동 (기본) | Player | Auto at nearest or aimed target | Auto | Survivor-style play |
| 스킬 수동 | Auto | Auto | Player | Boss fights on mobile |
| 완전 수동 | Player | Player triggers each book | Player | Arena, high-skill play |

Manual play earns a bonus: +10% damage in 스킬 수동, +20% in 완전 수동. Full auto is run by the server, so it keeps working when the browser throttles a background tab.

### Input

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD or arrows | Left virtual joystick |
| Aim | Mouse | Auto-aim, drag on right side to override |
| Books 1 to 6 (manual modes) | 1 to 6 or left click for the selected book | Six-button fan, bottom right |
| Dodge roll | Space | Dodge button |
| 멘토 찬스 | R | Large button above the fan |
| Mode cycle | Tab | Mode chip, top left |
| Chat | Enter | Chat bubble button |
| Interact | E | Context button |

### Combat rules

- Each equipped book is an attack with its own cooldown, shape and status effects. Tools are passives.
- Dodge roll: 0.25 s of invulnerability, 3 s cooldown.
- **Tagging.** Any player who deals at least 5% of a monster's health gets full personal EXP and their own loot roll. Nobody can steal a kill in a shared field.
- **Parties** of up to 4. Members within 20 tiles share kills, with +10% EXP per extra member.
- **기절.** At 0 HP the player is knocked out. Another player can revive them within 10 seconds (the reviver earns 상점). Otherwise they wake in the 보건실 with +1 벌점. No EXP or item loss.

### Monsters

Hordes in open fields: 60 to 150 alive per map, scaled to the number of players present.

| Archetype | Behavior |
|---|---|
| 추격형 | Walks at the nearest player |
| 돌진형 | Telegraphs, then charges in a line |
| 원거리형 | Keeps distance and fires slow projectiles |
| 분열형 | Splits into two smaller copies on death |
| 방패형 | Blocks from the front |
| 자폭형 | Runs in and explodes after a delay |
| 치유형 | Heals nearby monsters, priority target |
| 군집형 | Tiny, numerous, weak, fast |

Each field runs in waves: a surge, then a short lull the game calls 쉬는 시간. Every 200 kills in a field spawns an elite. Each Page reskins the eight archetypes with its own 오개념 and adds two unique behaviors.

### Hit feel

All of this is client-side and cosmetic. The server has already decided the hit.

| Effect | Spec |
|---|---|
| Hitstop | Target only. 50 ms for light hits, 100 to 160 ms for heavy hits. Never a global freeze in a shared map |
| Hit flash | Full-white tint for 2 frames |
| Knockback | Impulse = attack knock value ÷ monster mass, decaying 15% per tick. Server-decided, client-smoothed |
| Screen trauma | Trauma value 0 to 1, shake offset = trauma² × 4 px, decays 1.5 per second. Only the player's own hits and hits taken add trauma |
| Damage numbers | Pooled, max 40 visible, rapid hits merge into one growing number. Korean units (만, 억, 조) |
| Particles | Pooled, hard cap per quality tier (mobile 150, desktop 600) |
| Death | 3-frame pop, 4 to 6 debris pixels, drop arcs out |
| Sound | Layered impact (body + material + sweetener), max 8 voices, pitch varies ±6% |
| Squash and stretch | Scale tween on attack wind-up and landing, on every monster hop |

### Physics

No physics engine. A custom fixed-step simulation at 20 Hz on the server, shared with the client for prediction.

- Circle colliders, uniform spatial hash with 32 px cells.
- Tile collision grid per map.
- Monster separation by steering, so hordes flow around each other.
- Projectiles carry velocity, optional gravity with a fake height axis for arcs, pierce count and bounce count.
- Knockback is a velocity impulse. A knocked-back monster that hits another monster deals collision damage, which is the 물리 class's signature.

---

## 7. Classes

### Identity

| Class | Fantasy | Signature mechanic | Role |
|---|---|---|---|
| 수학 | Geometry, sequences, proof | **증명 스택**: consecutive hits on one target stack up to 10, then Q.E.D. deals a burst that ignores defense | Single-target and boss damage |
| 물리 | Kinematics, fields, light | **운동량**: knockback collisions deal damage and movement speed adds to damage | Crowd control, burst |
| 화학 | Reactions and states | **반응 표**: statuses combine. 산 + 염기 → 중화 (shield). 가연 + 불 → 연소 (area burn). 금속 + 산 → 부식 (armor break). 수분 + 나트륨 → 폭발 | Area damage over time |
| 생명 | Growth, infection, symbiosis | **증식**: minions divide, infections spread on death, kills feed sustain | Summoner, sustain, support |
| 지구과학 | Slow, huge, inevitable | **예보**: delayed area events with a visible telegraph, larger the longer the delay | Zone control, big hits, weather buffs |

### 전공 and 부전공

- 전공 is chosen at character creation and sets the class mechanic and the full book list.
- 부전공 unlocks at the 2학년 전직 (level 100). The player may equip up to 2 books and 2 tools from the minor subject. The minor's signature mechanic works at half strength.
- 20 major and minor combinations.
- 전과 (changing 전공) costs a large amount of 솔방울 plus a 전과 신청서 from the 학생회 상점, and resets nothing. Book levels stay, since books are items.

### 전직

| Tier | Level | Book slots | Tool slots | Unlocks |
|---|---|---|---|---|
| 신입생 | 1 | 2 | 1 | Basic kit |
| 1학년 | 30 | 3 | 2 | Dodge upgrade, trading, 동아리 |
| (중간) | 60 | 4 | 3 | |
| 2학년 | 100 | 4 | 4 | 부전공 |
| 3학년 | 250 | 5 | 5 | Evolved books |
| 연구생 | 500 | 6 | 6 | 논문: one class ultimate |

Each 전직 is a short solo quest given by a class senior, ending in an oral exam fight (구술 면접).

---

## 8. Study materials: books, tools, forging

### Structure

- **Book (책):** one attack. Has a grade, a level and a 필기 level.
- **Tool (도구):** one passive. Every book has one linked tool. Tools have levels 1 to 5, raised by merging duplicates.
- **Evolution:** a book of grade 심화서 or higher at level 100+, with its linked tool at level 5, evolves into a new form with new behavior.

### Launch books

Names are parodies. Each class launches with six books. Every Page adds one new book per class.

**수학**

| Book | Attack | Linked tool (passive) | Evolves into |
|---|---|---|---|
| 수학의 왕도 | Regular polygons orbit the player. Levels add sides, from triangle toward circle | 컴퍼스 (area size) | 유클리드 원론: a full circle shockwave |
| 함수 그래프 노트 | A piercing sine-wave beam | 모눈자 (range) | 푸리에 급수: stacked harmonics |
| 수열 문제집 | Bursts of 1, 1, 2, 3, 5, 8 shots, then resets | 계산기 (cooldown) | 발산 급수: the sequence never resets while hitting |
| 확률과 통계 | Rolls a die for each hit: ×1 to ×6 | 주사위 (crit chance) | 기댓값 정리: the roll can only go up within a fight |
| 좌표 평면 | Blink to a point, leaving damaging axes | 삼각자 (move speed) | 선형 변환: the axes rotate and scale |
| 증명 노트 | Raises the 증명 스택 cap and Q.E.D. damage | 빨간펜 (crit damage) | 완전한 증명: Q.E.D. chains to nearby targets |

**물리**

| Book | Attack | Linked tool (passive) | Evolves into |
|---|---|---|---|
| 홀리데이 일반물리 | A heavy tome thrown in a parabola. Big knockback | 저울추 (knockback) | 프린키피아 사본 |
| 역학 실험 키트 | A pendulum sweeps around the player | 초시계 (attack speed) | 푸코 진자: the swing plane rotates |
| 전자기 실습서 | Chain lightning between nearby enemies | 건전지 (chain count) | 맥스웰 방정식 |
| 광학 노트 | A laser that reflects off walls | 프리즘 (pierce) | 스펙트럼: splits into seven |
| 운동량 문제집 | A dash that carries enemies with it | 스프링 (dash distance) | 탄성 충돌: enemies bounce off each other |
| 중력 탐구 보고서 | A gravity well that pulls enemies together | 사과 (pull radius) | 만유인력 |

**화학**

| Book | Attack | Linked tool (passive) | Evolves into |
|---|---|---|---|
| 줌인 일반화학 | Thrown flasks leave acid pools. Needs a calculator, according to its description | 피펫 (status duration) | 왕수 |
| 주기율표 브로마이드 | Drops a random element: Na explodes on wet targets, He lifts, Fe armors the player | 원소 카드 (luck) | 멘델레예프의 꿈: choose the element |
| 유기화학 노트 | A carbon-chain whip that gets longer with each hit | 분자 모형 (range) | 고분자 |
| 실험 보고서 | Applies 가연, then ignites | 알코올램프 (burn damage) | 테르밋 |
| 몰 계산 문제집 | A cone of very many tiny hits | 전자저울 (hit count) | 아보가드로 수 |
| 산·염기 적정 노트 | Alternates acid and base shots. 중화 grants a shield | 지시약 (shield size) | 완충 용액 |

**생명**

| Book | Attack | Linked tool (passive) | Evolves into |
|---|---|---|---|
| 캠핑 생명과학 | Summons cells that divide up to a cap | 현미경 (minion cap) | 줄기세포: cells specialize by target |
| 유전 가계도 문제집 | Marks an enemy. On death the mark passes to two neighbors | 완두콩 (spread count) | 멘델의 법칙 |
| 해부 실습서 | Scalpel cone, causes bleed | 핀셋 (bleed damage) | 정밀 해부도 |
| 생태계 보고서 | Roots spread over an area and slow | 화분 (area growth) | 극상림 |
| 효소 반응 노트 | Aura: attack speed for self, party and minions | 시험관 (aura strength) | 촉매 |
| 면역 필기 | Antibodies orbit, block projectiles, heal on kill | 백신 (healing) | 집단 면역: the block covers the party |

**지구과학**

| Book | Attack | Linked tool (passive) | Evolves into |
|---|---|---|---|
| 지구는 둥글다 지구과학 | A fault line cracks open after a delay | 지진계 (telegraph speed) | 판 구조론 |
| 암석 표본 상자 | Thrown rocks cycle igneous (burn), sedimentary (slow), metamorphic (armor break) | 돌망치 (impact damage) | 암석의 순환 |
| 일기도 분석 노트 | A storm cloud follows the player: rain, then lightning | 풍향계 (cloud size) | 태풍의 눈 |
| 천체 관측 일지 | Marks a spot. A meteor lands there later | 망원경 (delay damage bonus) | 유성우 |
| 조석 예보표 | A wave pushes out, then pulls back | 달력 (wave frequency) | 사리 |
| 화산 탐구 보고서 | A vent that erupts on a cycle | 온도계 (eruption radius) | 성층 화산 |

### Grades

| Grade | Color | Damage multiplier | How to get |
|---|---|---|---|
| 교과서 | Gray | ×1.0 | Crafted from 낱장 |
| 참고서 | Green | ×1.5 | Forge 3 교과서 |
| 심화서 | Blue | ×2.2 | Forge 3 참고서, rare drop |
| 전공서 | Purple | ×3.3 | Forge 3 심화서, mid boss drop |
| 원서 | Gold | ×5.0 | Forge 3 전공서, era boss drop |

### The four ways a book gets stronger

| System | Station | Rule |
|---|---|---|
| 제본 (crafting) | 제본대 | 20 낱장 of a book + 제본 재료 → one 교과서-grade copy. 낱장 drop from that book's Page and from 복습 zones |
| 레벨 | Automatic | A book gains 10% of the EXP its owner earns while it is equipped, and can be fed spare 낱장. Book level cannot exceed character level |
| 필기 (enhancement) | Anywhere, from the bag | +1 per success, each + adds 4% damage. Costs 잉크 and 솔방울. Can fail with pity (table below). Never downgrades, never breaks |
| 제련 (forging) | 제련기 in the 메이커실 | Three copies of the same book at the same grade → one copy of the next grade, keeping the highest level and 필기 among them |

**필기 success rates.** Shown in the UI before every attempt.

| 필기 level | Base success |
|---|---|
| +1 to +5 | 100% |
| +6 to +10 | 90, 80, 70, 60, 50% |
| +11 to +15 | 45, 40, 35, 30, 25% |
| +16 and above | 20% |

Pity: every failure adds 10 percentage points to that book's next attempt, stacking until it succeeds. At the 20% floor, the ninth attempt is guaranteed. Cost per attempt: 잉크 = 10 × 1.15ⁿ and 솔방울 = 100 × 1.15ⁿ × grade multiplier, where n is the current 필기 level.

### Later layers (one per Page, see section 10)

- **포스트잇 (Page 3):** random affixes stuck onto a book, up to 3, rerollable.
- **원소 각인 (Page 9):** set bonuses for combinations of books.

---

## 9. Progression and numbers

These are the starting values. Milestone M3 includes a simulation script that plays a casual and a hardcore profile through a Page and reports days-to-level, so the constants get tuned before real players touch them.

### Growth constant

Everything scales by ×10 per 100 levels, so one Page is one order of magnitude. Numbers move one Korean unit (만 → 억 → 조) every four Pages.

```
G(L) = 10 ^ (L / 100)

monsterHP(L)   = 40 × G(L) × rank        rank: normal 1, elite 12, field boss 300
monsterEXP(L)  = 10 × G(L) × rank^0.8
monsterCoin(L) = 2  × G(L) × rank^0.8

expToNext(L)   = monsterEXP(L) × K(L)
K(L)           = min(3000, 100 + 60 × L)     kills-equivalent per level
```

### Player power

```
bookDamage = base × G(bookLevel) × gradeMult × (1 + 0.04 × 필기) × affixes
hitDamage  = bookDamage × (1 + 0.005 × 이해력) × critMult × levelFactor × modeBonus
playerHP   = 200 × G(L) × (1 + 0.005 × 체력)

levelFactor (attacking a monster d levels above you) = max(0.2, 1 − 0.02 × d)
EXP from a monster d levels below you, d > 10        = max(0.1, 1 − 0.05 × (d − 10))
```

### Stats

Three points per level, free to place, cheap to reset.

| Stat | Effect |
|---|---|
| 이해력 | Damage |
| 암기력 | Cooldowns and effect duration |
| 집중력 | Crit chance and crit damage |
| 체력 | HP and regeneration |
| 순발력 | Movement speed, dodge cooldown |
| 운 | Drop rate, 솔방울 gain |

### Endless levels in practice

There is no cap. The soft limit is natural: monsters above the current Page's band do not exist yet, so income flattens while the cost of each level keeps multiplying by about 2.3% per level. Veterans drift 30 to 60 levels above the band and then grow sideways through forging, 필기, 부전공 and collections until the next Page opens.

### Pacing targets (to verify by simulation)

| Profile | Daily play | Reaches top of the live band | Where they are when the Page ends |
|---|---|---|---|
| Casual | 20 min active + full 자습 pool | Week 9 to 11 | About band top |
| Regular | 1 h active + pool | Week 5 to 6 | Band top + 25 |
| Hardcore | 3 h active + pool | Week 3 | Band top + 50 |
| Newcomer in a 복습 zone | 20 min + pool | One sealed Page per 1 to 2 weeks | Reaches the frontier in 2 to 4 months, depending on how many Pages are sealed |

### Offline 자습 pool

- While logged out, the pool fills at **25%** of the player's best 10-minute income rate (EXP, 솔방울, 낱장) in the last field they hunted. The server measured that rate, so nothing is trusted from the client.
- Cap: **8 hours**. The fill bar and the cap are always visible.
- Logging out in the **자습실**: 35% rate and a 10 hour cap.
- Logging out in the **기숙사**: normal pool, plus 숙면: +50% EXP for the first 30 minutes of the next session.
- The pool pays EXP, 솔방울 and 낱장 only. Books, raid rewards and quest progress need the player online.

### Catch-up

In a sealed Page, EXP and pool income are multiplied by (1 + number of Pages between this zone and the frontier), up to ×8. A newcomer's first weeks are fast, and the multiplier fades to ×1 as they arrive at the live Page.

---

## 10. World structure and the Page lifecycle

### Maps

| Map type | Count | Notes |
|---|---|---|
| Campus hub | 1 world of about 8 linked maps | Safe. All stations, shops, social spaces |
| Per Page: era town | 1 | Safe. Mentors, quest board, era shop |
| Per Page: hunting fields | 4 | 25 levels each, about 80×60 tiles |
| Per Page: 위험 구역 | 1 | Elites and rare drops. Patrolled (section 11) |
| Per Page: mid boss lairs | 2 | Open world, shared |
| Per Page: era boss arena | 1 | Open world, shared, holds the whole server |

About 9 maps per Page, 108 era maps over Theme 1. Each map is one server room that holds up to 60 players. A second channel of a map opens automatically when the first is full.

### Shared progress

- The 0조 연구노트 is the server's progress screen: twelve stubs, refilled one Page at a time, with the date and the names of the players who landed the final hit and topped each board.
- When an era boss falls, the campus location where the rift opened is permanently changed for everyone (the 운동장 keeps a few marble columns and a statue of a tortoise).
- Each player also has a personal story log. Newcomers replay every past boss as a solo 복습 fight at their own level to see the cutscenes and earn first-clear rewards.

### Page lifecycle (target 13 weeks)

| Week | Server state |
|---|---|
| 0 | Rift opens. Era town and fields 1 and 2 available. New book per class enters the drop tables. New system unlocks |
| 2 | Fields 3 and 4 and the 위험 구역 open |
| 3 | Mid boss 1 appears |
| 6 | Mid boss 2 appears, if mid boss 1 is down |
| 10 | Earliest date for the era boss, if both mid bosses are down |
| 10 to 13 | Era boss raid |
| +1 | 시대 전환: epilogue quests, 동아리전쟁 final, cosmetics, then the next rift |

12 Pages × 13 weeks = 156 weeks = 3 years.

### Era boss raid rules (pure live raid)

- Once unlocked, the boss stands in its arena around the clock with a persistent HP bar. Anyone can walk in and fight at any time.
- The fight has four 논제 (phases), each with its own HP bar and mechanic set.
- **HP calibration.** At the start of each phase, HP is set from the server's measured total damage over the previous 14 days so that the phase takes about 4 to 5 days. A server that grows or shrinks still lands near 13 weeks per Page.
- **토론 시간.** Every night from 21:00 to 22:00 KST the boss takes +50% damage and uses its full mechanic set. This is the nightly gathering point.
- **Everyone counts.** Each phase has objectives (break a device, hold a zone, carry an object) that strip a fixed percentage of the boss's shield per completion, the same for a level 30 as for a level 1,000.
- **Rewards by participation tier,** per phase: 참석 (landed a hit), 기여 (30 minutes of active fighting or 3 objectives), 핵심 (2 hours or 10 objectives). Personal loot rolls. Damage, support and objective boards grant titles only.
- Knocked-out players respawn at the arena entrance with no 벌점.

### System cadence

One new system per Page keeps three years fresh and spreads the build work.

| Page | New system | Introduced by |
|---|---|---|
| 1 | Launch set: books, tools, 필기, 제본, 수행평가 board, parties, 동아리, trading, chat, arena duels, 도감 | 아리스토텔레스 |
| 2 | 제련 (forging to higher grades), collection bonuses | 갈레노스 |
| 3 | 포스트잇 affixes | 자비르 |
| 4 | Ranked arena seasons | 갈릴레오 |
| 5 | 동아리전쟁 | 뉴턴 |
| 6 | 멘토 찬스 (scientist ultimates) | 라부아지에 |
| 7 | 사육 (companions) | 다윈 |
| 8 | 기숙사 방 꾸미기 | 맥스웰 |
| 9 | 원소 각인 (set bonuses) | 톰슨 |
| 10 | 날씨 이벤트 in open fields | 베게너 |
| 11 | 무한의 탑 (endless mode) | 힐베르트 |
| 12 | Finale and 졸업 | |

---

## 11. School rules as mechanics

There is no day cycle. Rules apply by place and by action.

### 벌점 and 상점

| Earns 벌점 | Amount |
|---|---|
| 기절 in a field | +1 |
| Caught by a patrol in a 위험 구역 | +2 |
| Caught eating in the 기숙사 by 권 사감 | +1 |
| Chat filter strike confirmed by an admin | +3 |

| Earns 상점 | Amount |
|---|---|
| Reviving another player | +1 |
| Finishing a 도움 quest for a lower-level player | +1 |
| 청소 당번 daily quest | +1 |
| Serving as 층장 for a week | +5 |

- 상점 cancels 벌점 one for one. Spare 상점 is a currency at the 학생회 상점.
- **명령퇴사** at 20 벌점: the player is sent home for 10 minutes (a one-room map, a parent asking if they are eating properly), returns with −30% EXP for an hour and the title 「집에 갔상」. 벌점 resets to 0.
- **층장.** Each week the five players with the most 상점 become 층장: a badge, +1 hour on the 자습 pool cap, and the right to pin one notice on the 대자보.

### Buffs for living by the rules

| Rule | Effect |
|---|---|
| 급식 | Eat at the 급식실 for a 30-minute buff. The menu, and so the buff, rotates daily |
| 자습실 착석 | Log out in the 자습실 for a bigger offline pool |
| 숙면 | Log out in the 기숙사 for a rested EXP bonus |
| 졸음 | Two hours of continuous full-auto hunting adds 졸음: −10% EXP. Standing at a 졸방대 for 30 seconds or drinking an 에너지 드링크 clears it |
| 단정한 복장 | Wearing the school uniform in the hub: +5% 상점 gain |
| 과잠 | Wearing a club jacket next to clubmates: small stat aura |

### 위험 구역 patrols

Each Page's restricted zone has patrols with visible vision cones (Athenian guards, museum scribes, Royal Society porters). Elites there drop the best 낱장. Getting spotted teleports the player out with +2 벌점.

### Joke awards (titles)

다 먹었상 (most 급식 eaten in a week), 딱 걸렸상 (caught by patrols 10 times), 집에 갔상 (first 명령퇴사), 개근상 (30 daily boards in a row).

---

## 12. Social systems

### Chat

| Channel | Scope | Notes |
|---|---|---|
| 전체 | Whole server | Level 5 to speak, which slows throwaway spam accounts |
| 주변 | 12-tile radius | Appears as a speech bubble over the character and in the log |
| 파티 | Party | |
| 동아리 | Club | |
| 귓속말 | One player | Works across maps |
| 시스템 | Server | Boss phases, Page events, rare drops, 층장 notices |

- 120 characters per message. Rate limit: 5-message burst, then 1 per second.
- Links are not clickable. Item links and coordinates are.
- Chat is one persistent connection beside the map connection, so it survives map changes.

### Friends, block, report

- Friend list with online status and current map. Mutual add.
- Block hides a player's chat, bubbles, trades and party invites.
- Report from any message or player card: category, optional note, and the last 20 messages from that player attached automatically.

### Emotes

A wheel of eight at launch (인사, 박수, ㅋㅋ, 졸림, 화이팅, 절, 춤, 멘붕). More unlock from events and the 학생회 상점. Emotes are character animations plus a small icon bubble.

### 대자보

A physical board in the 쉼표 라운지 and a menu shortcut. Categories: 파티 모집, 거래, 동아리 홍보, 잡담. Posts last 48 hours, one active post per player per category, 200 characters. 층장 can pin one notice.

### 동아리 (player guilds)

- Create at level 30 for a 솔방울 fee. Up to 30 members, so a 200-player server supports many clubs.
- Ranks: 짱, 부짱, 부원. 짱 sets the join rule (open, apply, invite only).
- **과잠.** Each club picks a jacket color and builds a back emblem from preset shapes and symbols in a small editor. Members wear it as a cosmetic layer.
- **동아리실.** Each club gets a door in the 가설관 club corridor leading to its own room, with a notice wall and a trophy shelf.
- **Club level** rises from member activity and unlocks room decorations and a larger roster of emblem parts.
- **주간 동아리 보스.** A weekly boss in the club room, scaled to the club's size, with a club-wide reward.
- **동아리전쟁** from Page 5 (section 14).

### Parties

Up to 4. Invite from a player card, the friend list or a 대자보 post. Party frames show HP, class and control mode.

### Moderation

| Tool | Spec |
|---|---|
| Filter | Korean and English word list, matched after normalizing spacing, repeated characters and decomposed jamo. Hits are masked, repeat hits within 10 minutes mute for 5 minutes |
| Rate limits | Chat, 대자보 posts, trade requests, party invites, friend requests |
| Signup limits | 3 accounts per IP per day, 14 and over self-declared, banned-name list |
| Admin page | Search players, read chat by player or time range, mute, kick, ban (account and IP), grant or remove items, review the report queue, edit the filter list, broadcast a notice |
| Audit log | Every admin action is recorded with who, what and when |
| Retention | Chat logs kept 90 days, stated in the privacy policy |

---

## 13. Economy and stores

### Currencies

| Currency | Source | Spent on |
|---|---|---|
| 솔방울 | Monsters, quests, selling | 필기, 제본, 제련, shop goods, listing fees, club creation, 전과 |
| 상점 | Rule-following and helping (section 11) | 학생회 상점: cosmetics, emotes, 전과 신청서, stat resets |
| 탐구 토큰 | Mid and era boss participation | 탐구 상점: 전공서 낱장, boss cosmetics, titles |
| 낱장, 잉크, 제본 재료 | Drops, 자습 pool, quests | Crafting and 필기 |

### Stores

| Store | Sells | Stock |
|---|---|---|
| 자판기 | Potions, 에너지 드링크, snacks with short buffs | Fixed, restocks weekly with one random special |
| 학생회 상점 | Cosmetics, emotes, convenience items | Rotates each Page |
| 탐구 상점 | Boss rewards | Per Page |
| 멘토 상점 | Each freed scientist sells recipes and tools from their era | Permanent once the scientist is freed |
| 코스튬 진열장 | Uniform variants, hair, accessories | Rotates daily, 6 items |
| 매점 게시판 | Player listings | Player-driven |

No random boxes. Every item in an NPC store has a fixed price.

### Player trading

| Rule | Value |
|---|---|
| Unlock | Level 30 (1학년) |
| 매점 게시판 | 10 listings per player, 48 hours each, 2% listing fee up front, 5% tax on sale, price history shown for the last 14 days |
| Direct trade | Both players within 5 tiles, two-step confirm, 5% tax on 솔방울 moved |
| Bound items | Era boss drops, quest rewards, 상점 purchases and 탐구 상점 purchases cannot be traded |
| Re-trade cooldown | An item bought or received cannot be traded again for 24 hours |
| Real-money trading | Banned in the terms. Trade logs are kept and searchable in the admin page |

### Keeping the economy healthy

- Every 솔방울 entering and leaving the game is recorded by source and sink. The admin page shows daily totals, so inflation is visible within a week.
- The big sinks scale with progress on purpose: 필기 cost grows 15% per level and 제련 fees scale with grade.
- If the faucet outruns the sinks, the lever is the listing tax and shop prices, changed at a Page boundary and announced.

---

## 14. PvP

### 콜로세움 (arena duels, from launch)

- 1v1 and 3v3 in the 새벽관 courtyard. Spectators watch from the corridor ring.
- **Normalized.** Both sides are set to the same level. Grade and 필기 are flattened to fixed values. Builds, evolutions and play decide the match.
- Nothing is lost on defeat.
- Casual queue at launch. Ranked seasons from Page 4, one season per Page, with cosmetic rewards and a title for the top 10.

### 동아리전쟁 (from Page 5)

- A season is one Page. Matches run Saturdays at 21:00 KST for 30 minutes.
- Format: three capture points on a dedicated map, normalized stats, teams of 5 to 10 depending on turnout.
- Round-robin over the season, finals in the 시대 전환 week.
- Rewards: a trophy for the 동아리실, emblem parts, a server-wide banner on the campus for the winning club until the next season.

---

## 15. Quests, codex and live events

### 수행평가 board

| Type | Count | Reset |
|---|---|---|
| Daily | 5 per player, drawn from the Page's pool | 05:00 KST |
| Weekly | 3 | Monday 05:00 KST |
| Repeatable hunts | Unlimited | Rewards step down 100, 80, 60, 40, then 20% for the rest of the day |
| 도움 | Any | Posted by players below the frontier, completed by helping them |

Quest kinds: hunt N of a monster, collect drops, escort a freed scientist's assistant, clear a wave without being hit, deliver to an NPC across the map, help another player finish theirs.

### Story quests

Main-story chapters play for everyone when the server reaches them. Each player then completes a personal version for rewards. Players who join later get the same chapters through 복습.

### 도감 (codex)

| Section | Entry unlocks when | Content |
|---|---|---|
| 과학자 | The boss is freed | Who they were, what they got right, the wrong theory they held, what replaced it and who showed it |
| 오개념 | 100 kills of a monster | The misconception it stands for, in two sentences |
| 책 | A book is crafted | Flavor text and the concept behind its attack |
| 학교 | A place is visited | Campus lore |

Completing sets gives small permanent bonuses. Every entry is short, accurate and sourced from Appendix C.

### Live events (real calendar)

| When | Event | What happens |
|---|---|---|
| 3월 14일 | 파이데이 | A π recital contest (type as many digits as you can), circle-themed monsters, class-versus-class games |
| 4월 1일 | 만우절 | Players and monsters swap sprites for a day. Bosses are tiny |
| 5월 | 체육대회 | Relay races and tug-of-war between the five 전공 |
| 9월 | 로켓의 날 | Build and launch model rockets: a small physics minigame with a height leaderboard |
| 가을 | 해솔제 | A festival week: club booths as minigames, a stage for emote performances, an escape room in the math seminar rooms |
| 연 4회 | 시험 기간 | A week-long 시험 문제 raid boss in the hub, and better food at the 급식실 |
| 12월 31일 | 종업식 | Server stats of the year, awards, fireworks |
| Meteor showers | 천체 관측회 | Rooftop gathering with a rare-drop window |

A 방학 event (double 자습 pool) is the reserve lever for any stretch where the next Page needs more build time.

---

## 16. Art direction (code-drawn)

Every sprite, tile, effect and UI element is authored as source code by Claude and compiled to PNG atlases by a build script. No drawing tool and no image model.

### Spec

| Item | Value |
|---|---|
| Tile | 16×16 |
| Player character | 16×24, head about 10 px tall |
| Monsters | 16×16 to 32×32 |
| Mid bosses | 48×48 to 64×64 |
| Era bosses | 96×96 and up, built from parts that animate independently |
| Internal resolution | 480×270, integer scaling only |
| Directions | Down, up, side (side is flipped for left and right) |
| Frames | Idle 2, walk 4, attack 4, hit 1, knocked out 1, per direction |
| Outline | A darkened shade of the fill on the outer silhouette. No pure black. Interior lines one step lighter |
| Light | From the top left, on every sprite |
| Colors per sprite | 4 to 6 per material, hue-shifted ramps (shadows cooler, highlights warmer) |

### Palette

A project-owned 64-color master palette, **해솔 64**, defined in code as hue-shifted ramps. Owning the palette removes any license question, and it is tuned for the game's two moods: warm fluorescent school interiors and saturated era worlds.

Each Page gets a palette theme: a remap of the tile ramps (Greek marble and olive, Alexandrian papyrus and lapis, alchemical copper and green fire, and so on). Era tile atlases are baked per theme at build time. Characters keep the master palette everywhere so players always read clearly against the world.

### Sprite source format

```
// art/sprites/monsters/odap.ts
export default sprite({
  size: [16, 16],
  palette: { '.': null, o: 'red.dark', r: 'red.mid', R: 'red.light', w: 'white' },
  frames: {
    idle0: `
      ................
      ..oo........oo..
      .orRo......oRro.
      ...
    `,
  },
  anim: { idle: ['idle0', 'idle1'], fps: 4 },
})
```

- One character per pixel, a legend maps characters to named palette entries.
- Body parts are separate small grids. Walk and attack frames are assembled by offsetting and swapping parts, so a new hairstyle is one grid and animates automatically.
- The build script (`pngjs` plus a small shelf packer) writes atlases and Phaser atlas JSON. No native image dependencies.

### Characters (paper doll)

Layers, back to front: shadow, body, uniform, 과잠, face, hair, accessory, book in hand. All layers share one frame grid, so alignment is automatic. A character is composited once into a texture when their look changes and cached. Hair and jacket colors use a palette lookup shader so one grid serves every color.

Launch customization: 3 body tones, 12 hairstyles × 10 colors, 6 faces, 4 uniform variants, glasses and 5 accessories.

### Tiles

- **Dual-grid autotiling:** terrain transitions need only 16 tiles per terrain pair, which is the cheapest scheme to draw in code.
- 2 to 4 variants per base tile chosen by position hash, plus decals (cracks, flowers, pebbles, chalk dust) scattered by noise, so the grid never reads as a grid.
- Maps are authored as code: a generator per map type lays terrain with noise and rules, then hand-written ASCII stamps place landmarks, buildings and spawn zones. Output is tilemap JSON.

### Monsters at volume

Ten to fifteen hand-written base archetypes as grids. Variation by palette swap, part swap (heads, limbs, horns) and scale. Procedural generation is used for variety only. Every 오개념 that matters to the story is drawn by hand.

### Where the wow comes from

Most of the visual impact is code running on top of simple sprites.

| Effect | Technique | Mobile |
|---|---|---|
| Lighting | Phaser 4 per-object lighting on tiles and characters, point lights on lamps, rifts and spells | Reduced light count |
| Rifts | A custom shader: chromatic split, slow swirl, particles drawn inward | Simplified |
| Era color grading | A color-grade filter per Page | On |
| Bloom and glow | Filters on spell effects and boss telegraphs only | Additive sprites instead |
| Weather | Screen-space rain, snow, sand, embers as particles | Lower count |
| Water and foliage | Small vertex-wobble shaders | Off |
| Shadows | Soft blob shadows under everything | On |
| Boss entrances | Letterbox, camera push, palette drain to one color, then flood back | On |

Three quality tiers (low, medium, high) are chosen automatically from a short frame-time probe and can be overridden in settings.

### Animation by code

Squash and stretch through scale tweens, sine bobbing for idle, a 2-frame white hit flash, smear frames as stretched ghost copies on fast attacks, attack arcs as tweened slash sprites. This keeps hand-drawn frame counts low.

### Reviewing art without an artist

- `pnpm art:sheet` renders a contact sheet page: every sprite and frame at ×1 and ×4, on a checkerboard and on each era's background colors, with animations playing.
- Automated checks in the build: every pixel is in the palette, no orphan pixels, outlines closed, no large pixel-count jumps between frames of one animation.
- Andy reviews the contact sheet. That is the visual gate for each Page.

---

## 17. Audio

- **Music:** chiptune-plus tracks composed in code (a small tracker format rendered through Web Audio), one hub theme, one field theme and one boss theme per Page. The school theme returns as a motif inside every boss theme.
- **Effects:** synthesized (jsfxr-style parameter sets stored as data). Each class has its own impact family.
- **Mix rules:** 8 effect voices, ducking under boss telegraphs, separate sliders for music, effects and ambient. Audio starts on the first tap, as mobile browsers require.
- A wake-up song plays on first login of the day. Players vote on it weekly. They will learn to hate it.

---

## 18. UI and screens

| Screen | Contents |
|---|---|
| Title and login | ID, password, signup, notice |
| Character creator | Live animated preview in the center, class tabs that play each class's attack on a training dummy, look options, name |
| HUD | HP, EXP bar, control mode chip, book cooldown fan, minimap, chat panel (collapsible), 벌점 counter, 자습 pool indicator |
| 가방 | Books, tools, materials, cosmetics. 필기 from a book's detail card |
| 장비 | Six book slots, six tool slots, evolution hints, 부전공 slots marked |
| 캐릭터 | Stats, 전직 progress, titles, 기수 |
| 수행평가 | Daily, weekly, repeatable, story tabs |
| 연구노트 | Server progress: twelve pages, current boss HP by phase, boards |
| 도감 | Scientists, 오개념, books, school |
| 동아리 | Roster, notices, emblem editor, weekly boss, war schedule |
| 매점 게시판 | Search, price history, my listings |
| 친구 | Friends, blocked, recent players |
| 설정 | Graphics tier, audio, controls, language, account |

**Rules.** One UI for both platforms: bottom-anchored panels sized for thumbs, keyboard shortcuts on desktop. Every panel opens in under 100 ms from local data, then refreshes. Korean font: a pixel font with full Hangul coverage under an open license (Galmuri or NeoDunggeunmo), bundled.

---

## 19. Technical architecture

### Version pins (checked 2026-11-25, sources in Appendix B)

| Piece | Choice | Version |
|---|---|---|
| Runtime | Node.js LTS | 24 |
| Package manager | pnpm workspaces | 11 |
| Client build | Vite | 8 |
| Client engine | Phaser | 4.2 |
| Realtime server | Colyseus, with `@colyseus/schema` 5 and `@colyseus/sdk` 0.18 | 0.18 |
| Database | PostgreSQL | 17 |
| DB access | Drizzle ORM on `pg` | 0.45 |
| Password hashing | Argon2id | m = 19 MiB, t = 2, p = 1 |
| Reverse proxy | Caddy (automatic TLS, WebSocket with no extra config) | 2 |
| Deploy | Docker Compose on one VPS | |

Phaser 4 is the current production line (3.x ended at 3.90). Colyseus's official Phaser tutorial still targets older versions of both, so it is a reference for structure only.

### Repository layout

```
guago_kiougi/
  apps/
    client/        Phaser 4 + Vite. Scenes, rendering, input, UI
    server/        Colyseus rooms, simulation, persistence, HTTP API
    admin/         Small web admin (moderation, economy, server state)
  packages/
    shared/        Formulas, simulation step, message types, constants
    content/       Typed game data: books, tools, monsters, quests, pages, dialogue
    art/           Sprite and tile sources, palette, build script, contact sheet
    audio/         Tracker songs and effect parameter sets
  tools/
    balance-sim/   Plays simulated profiles through the curves
    loadtest/      Headless bot clients
  docs/
    PLAN.md
  docker/
    compose.yml, Caddyfile
```

`shared` and `content` are imported by both client and server, so a damage formula or a book definition exists once.

### Runtime topology

```
Browser ──HTTPS/WSS──> Caddy ──┬──> static client files
                               ├──> game server :2567 (one Node process)
                               │       ├─ WorldRoom   (1)       chat, presence, parties, clubs, trades, server events
                               │       ├─ MapRoom     (per map and channel)   simulation at 20 Hz
                               │       ├─ ArenaRoom   (per match)
                               │       └─ ClubRoom    (per club, on demand)
                               └──> admin (IP-restricted)
                         game server ──> PostgreSQL
```

A client holds two connections: the WorldRoom for the whole session and one MapRoom for wherever the character stands.

### Simulation and netcode

| Topic | Design |
|---|---|
| Authority | The server simulates movement, monsters, hits, drops, EXP and every item operation. Clients send inputs only |
| Tick | Fixed 20 Hz simulation step in `shared`, state patches at 20 Hz (Colyseus default 50 ms) |
| Own movement | Predicted locally with the same step function, reconciled against the server by input sequence number |
| Other entities | Rendered 100 ms in the past, interpolated between patches |
| Hit feedback | The client plays swing and projectile visuals at once. Damage numbers, hitstop and knockback play when the server's hit event arrives |
| Full auto | The server runs the character's AI, so it is unaffected by background-tab throttling |
| Interest management | Colyseus `StateView` per client. Maps are divided into cells of 16×16 tiles. A client sees its cell and the 8 around it. Views update only when an entity crosses a cell boundary |
| Fallback | If per-entity schema sync costs too much with dense hordes, monsters move to one compact batched snapshot message per cell. Decided by the M2 load test |
| Reconnect | Colyseus reconnection window of 30 seconds. The character stays in the world and switches to full auto meanwhile |
| Single session | A second login on an account disconnects the first |

### Persistence

- Character state loads on join and is written back every 30 seconds if changed, and on leave.
- Anything economic (trade, listing, 제본, 필기, 제련, purchase, quest claim, boss reward) is written at once inside a database transaction with a unique operation id, so a retry cannot apply twice.
- All randomness is rolled on the server.
- Server-wide state (current Page, boss phase and HP, 연구노트) is its own row set, written every 10 seconds during a raid.

### Budgets

| Budget | Target |
|---|---|
| Server tick time | Under 10 ms at p95 with 80 players and 150 monsters per busy map |
| Downstream per client | Under 8 kB/s in a horde field |
| Client frame rate | 60 fps desktop, 30 fps or better on a mid-range phone at the low tier |
| First load | Under 5 MB. Each Page's assets load on entering its rift, under 2 MB |
| Atlas size | 2048×2048 maximum for mobile WebGL |

### Hosting and operations

- **VPS:** Seoul region. Start at 2 vCPU and 4 GB, move to 4 vCPU and 8 GB if the tick budget needs it (about 48 USD a month at Vultr Seoul for the larger size in current listings). Expected traffic is well under 1 TB a month.
- **Deploy:** build images, `docker compose up -d`. The server announces a restart 5 minutes ahead, flushes all state, then exits.
- **Backups:** nightly `pg_dump` copied off the box, 7 daily and 4 weekly kept. A restore is rehearsed once before launch.
- **Monitoring:** structured logs, a metrics endpoint (players online, room count, tick time, patch bytes, DB latency), an external uptime ping, and an alert to Andy's phone when the server is down or tick time doubles.
- **Page releases:** content ships dark ahead of time and opens when the server state flips, so a Page opening needs no deploy at the moment of the boss kill.

---

## 20. Data model

| Table | Key columns |
|---|---|
| `accounts` | id, login_id (unique), password_hash, recovery_code_hash, status, age_confirmed, signup_ip_hash, created_at, last_login_at |
| `sessions` | token_hash, account_id, expires_at |
| `characters` | id, account_id, name (unique), major, minor, level, exp, stats, look, map_id, x, y, control_mode, tier, cohort, demerits, merits, titles, pool_started_at, pool_rates, rested_until |
| `wallets` | character_id, pinecones, merit_points, tokens |
| `items` | id, owner_id, def_id, kind (book or tool), grade, level, exp, pilgi, pilgi_fail_streak, affixes, bound, tradable_at, slot |
| `materials` | character_id, def_id, qty |
| `quest_progress` | character_id, quest_id, state, progress, reset_at |
| `story_progress` | character_id, chapter_id, cleared_at |
| `codex_unlocks` | character_id, entry_id, unlocked_at |
| `friends`, `blocks` | character_id, other_id |
| `clubs` | id, name, leader_id, join_rule, level, exp, jacket_color, emblem |
| `club_members` | club_id, character_id, rank, joined_at |
| `listings` | id, seller_id, item_id or material, qty, price, expires_at, state |
| `trade_log` | id, kind (board or direct), from_id, to_id, payload, tax, at |
| `board_posts` | id, author_id, category, body, pinned, expires_at |
| `chat_log` | id, channel, sender_id, target, body, at (partitioned by day, 90-day retention) |
| `reports` | id, reporter_id, target_id, category, note, context, state, handled_by |
| `admin_actions` | id, admin_id, action, target, detail, at |
| `server_state` | current_page, page_opened_at, boss_id, phase, phase_hp, phase_started_at |
| `boss_participation` | boss_id, phase, character_id, active_seconds, objectives, damage, support |
| `notebook` | page, sealed_at, final_hit_by, board_leaders |
| `economy_ledger` | day, source_or_sink, currency, amount |
| `arena_ratings` | season, character_id, rating, wins, losses |

One character per account at launch. Large numbers are stored as double precision, which holds every value the growth curve produces through Theme 1.

---

## 21. Network protocol

**Client to server (MapRoom).** `input` (move vector, aim, sequence), `cast` (book slot), `dodge`, `interact`, `setMode`, `emote`, `revive`, `pickup`.

**Client to server (WorldRoom).** `chat`, `whisper`, `friend.*`, `block.*`, `party.*`, `club.*`, `trade.*`, `listing.*`, `board.*`, `equip`, `craft`, `pilgi`, `forge`, `quest.*`, `shop.buy`, `report`, `claimPool`.

**Server to client.** State patches for entities in view. Events: `hit`, `death`, `drop`, `levelUp`, `statusApplied`, `bossPhase`, `telegraph`. World messages: `chat`, `system`, `presence`, `tradeUpdate`, `result` (with the operation id of the request).

**Rules.** Every incoming message is validated against a schema and rate-limited per type. Positions from the client are never accepted. Every request that changes items or currency carries an operation id and gets exactly one `result`.

---

## 22. Security and anti-cheat baseline

Andy set deeper security hardening aside for later. This is the floor the launch build keeps, since each item is cheap now and expensive to retrofit.

| Area | Baseline |
|---|---|
| Passwords | Argon2id, never logged, minimum 8 characters |
| Account recovery | No email exists, so signup shows a one-time recovery code to save. Stored hashed |
| Sessions | Random 256-bit tokens, stored hashed, httpOnly cookie, 30-day expiry |
| Login abuse | 5 failed attempts per account and IP per 15 minutes |
| Transport | HTTPS and WSS only |
| Cheating | Server authority removes speed, damage and teleport hacks. Inputs are rate-checked |
| Duplication | Transactions with operation ids, one live session per account, server-generated item ids |
| Bots | Level gates on chat and trade, 졸음 on long auto sessions, signup limits per IP |
| Admin | Separate login, reachable only over Tailscale |
| Injection | Parameterized queries through Drizzle, chat rendered as text |

**Deferred.** Captcha at signup, two-factor login, DDoS shielding in front of Caddy, automated anomaly detection on the economy ledger.

---

## 23. Legal and release checklist (Korea)

Findings from research on 2026-11-25. Items marked **confirm** need a written answer from the agency or a lawyer before public launch.

| Topic | Finding | Action |
|---|---|---|
| 게임물 등급분류 | Since September 2019, games made by individuals for non-profit public release are exempt, unless the content reaches 청소년이용불가 level | Keep the game free with no ads and no donations. Keep violence cartoon-level. **Confirm** the exemption in writing with 게임물관리위원회, since the decree was revised in March 2026 |
| 게임제작업 등록 | Registration applies to a business. Whether a free hobby project counts is unclear | **Confirm** with the 구청 or 게임물관리위원회 |
| 확률형 아이템 공개 | The 2024 disclosure duty covers items obtainable with money. Free-only items are outside it | Stay fully free. Show 필기 odds in the UI anyway |
| 개인정보 | A login ID combined with IP and logs counts as personal information. A published 개인정보 처리방침 is mandatory | Write the policy: purpose, items collected, retention, destruction, safeguards, contact for the 보호책임자 |
| 만 14세 미만 | Collecting data from under-14s needs a legal guardian's consent | Signup declares 14 or over. **Confirm** that a self-declared gate is sufficient |
| 비밀번호 | One-way hashing is the standard requirement, access logs kept at least 1 year | Argon2id. Keep admin access logs for a year |
| 채팅 기록 | Operators normally state in the terms that chat may be recorded and reviewed for moderation | Put it in the 이용약관. State the 90-day retention in the privacy policy |
| 셧다운제 | Abolished January 2022 | Nothing required |
| 아이템 거래 | Trading with in-game currency raises no issue. Real-money trading is the risk | Ban 현금거래 and account sales in the terms, with sanctions |
| 실존 인물 | Korea has no statutory right of publicity. A US court ruled in 2012 that Einstein's publicity right had expired, and his estate still asserts rights commercially | Original art only, no photos, no archive quotes, no merchandise. Keeping the game non-commercial keeps this low-risk |

**Before public launch**

- [ ] Written confirmation of the non-profit rating exemption
- [ ] Answer on 게임제작업 registration
- [ ] 이용약관: 현금거래 ban, chat recording and review, sanctions, report process, 14 and over
- [ ] 개인정보 처리방침 with a contact
- [ ] Under-14 approach confirmed
- [ ] No ads, donations or paid routes anywhere in the product
- [ ] Report button and admin review working

---

## 24. Content budget for three years

### Per Page

| Content | Amount | How it is produced |
|---|---|---|
| Maps | 9 | Generator plus hand-placed stamps |
| Tileset and palette theme | 1 set, about 120 tiles | Code-drawn, dual-grid |
| Monsters | 8 reskinned archetypes + 2 unique | Base grids with part and palette swaps |
| Mid bosses | 2 | Hand-drawn in code, one signature mechanic each |
| Era boss | 1, in 4 phases | Hand-drawn in parts, 2 to 3 mechanics per phase |
| New books | 5 (one per class), each with tool and evolution | Data plus one attack script each |
| New system | 1 | Feature work |
| Quest pool | About 40 templates filled with the Page's monsters and NPCs | Data |
| Story | About 12 beats, 3 cutscenes | Written by hand |
| 도감 | About 25 entries | Written by hand, fact-checked |
| Music | 3 tracks | Tracker data |

### Theme 1 totals

108 era maps, about 120 monsters, 24 mid bosses, 12 era bosses and the Demon, 85 books (30 at launch plus 55), 12 systems, about 150 story beats, about 300 codex entries.

### Staying ahead

- Launch requires Page 1 complete and Page 2 at 70% or more.
- The working rule is to stay one full Page ahead of the server. A Page takes the server 13 weeks to clear, which is the build window for the Page after next.
- The 10-week floor on the era boss and the HP calibration protect that window. A 방학 event is the last reserve.

---

## 25. Roadmap and milestones

Durations are targets for agent-driven development with Andy reviewing.

| Milestone | Target | Delivers | Exit check |
|---|---|---|---|
| M0 Foundations | 1 to 2 weeks | Monorepo, typecheck and lint, art pipeline with palette and contact sheet, empty Phaser scene talking to a Colyseus room, deployed skeleton on the VPS | A sprite written as code appears in a browser served from the VPS |
| M1 Walking world | 2 to 3 weeks | Signup and login, character creator with live preview, campus hub maps, movement with prediction, interest management, global and nearby chat, mobile controls | Two phones and a laptop walk around the campus and talk |
| M2 Combat | 3 to 4 weeks | Server simulation, eight monster archetypes, two books per class, the four control modes, hit feel, drops, 기절 and revive, bot load test | 80 bots and 150 monsters in one map inside the tick budget. Andy signs off on how hits feel |
| M3 Progression | 3 weeks | Levels and stats, all 30 launch books and tools, 제본, 필기, evolutions, 수행평가 board, 자습 pool, 전직, balance simulation | The simulation shows the casual and hardcore pacing targets within 20% |
| M4 Page 1 | 4 weeks | Nine maps, monsters, both mid bosses, Aristotle, the raid system with calibration, opening sequence, story beats, 도감 | A full Page played end to end on a test server with time compressed |
| M5 Social and economy | 3 weeks | Friends, parties, 동아리 with 과잠 and rooms, 대자보, emotes, 매점 게시판, direct trade, 벌점 and 상점, arena duels, moderation and admin page | A trade, a club, a duel and a ban each work end to end |
| M6 Closed beta | 3 to 4 weeks | 20 to 30 invited players, tuning, legal documents, backups and monitoring rehearsed | A week with no data loss and no blocker bugs. Beta data is wiped |
| M7 Launch | | Page 1 opens to the public. Page 2 at 70% or more | |
| Live | Every 13 weeks | Next Page, its system, its season | |

About five to six months from M0 to launch.

**Build order inside each milestone.** Shared formulas and content data first, server behavior second, client presentation third. Each feature lands as its own pull request from its own worktree.

---

## 26. Testing strategy

Tests go where a regression would cost real players something.

| Area | Approach |
|---|---|
| Shared formulas | Unit tests for the growth curve, damage, EXP, tagging, 필기 pity, 제련, pool accrual and catch-up multipliers |
| Economic operations | Integration tests against a real Postgres for trade, listing, craft and purchase: atomic, idempotent under retry, no duplication when two requests race |
| Simulation | A deterministic replay test: recorded inputs produce the same world state |
| Capacity | The bot load test, run at M2 and before each Page release |
| Balance | The balance simulation, run whenever a curve constant changes |
| Art | Build-time palette and pixel checks, plus the contact sheet review |
| Everything else | Manual playtest checklist per milestone. No blanket UI or smoke tests |

---

## 27. Risks and open items

### Risks

| Risk | Why it matters | Response |
|---|---|---|
| Solo content cadence | Twelve Pages is a lot for one person | Formula-driven content, one-Page lead, 10-week floor, 방학 reserve |
| Dense hordes over the network | Many moving entities per client | Cell-based views, batched snapshot fallback, load test at M2 before content is built on it |
| Mobile performance | Phones run the same world | Quality tiers, 2048 atlases, effect caps, low-tier checks on a real mid-range phone each milestone |
| Veterans carry raids | Endless levels and a pure live raid | Objectives worth the same for everyone, participation-tier rewards, 토론 시간 |
| Inflation and duplication | Direct trade spreads any exploit | Transactions with operation ids, economy ledger, re-trade cooldown, bound boss drops |
| Moderation load | Public signup and global chat, one moderator | Filter, level gates, rate limits, report queue, 90-day logs |
| Rating exemption | Launch depends on staying non-commercial | Written confirmation before launch, no ads or donations |
| Code-drawn art quality | "Stunning" is the brief | Lock the style on a vertical slice in M0 and M2, contact sheet review per Page, effects carry the spectacle |
| Raid timing drift | Server size will change | Per-phase HP calibration from measured damage |

### Open items for Andy

1. The Theme 2 trigger event at graduation (a proposal is in section 4).
2. Final school name and city. 해솔과학고등학교 and 미추시 are placeholders.
3. Whether a self-declared 14-and-over gate is acceptable, pending the legal answer.
4. VPS provider and size.
5. The closed beta invite list.
6. More than one character per account, or a mentor system for seniors and juniors, as post-launch additions.

---

## Appendix A: School source material and parody map

Kept in `docs/private/school-source.md`, a local file that git ignores.

---

## Appendix B: Research digests and sources

Five research passes ran during planning. Several target sites (Namu Wiki, Fandom, some government pages) blocked automated reading, so part of each digest rests on general knowledge. Claims without a link are unverified.

### B.1 Classic Korean MMORPGs

- MapleStory job advancement by level tier, each tier adding a skill set. Later tiers (5th and 6th job) were added as endgame extensions. [Wikipedia](https://en.wikipedia.org/wiki/MapleStory)
- 바람의나라 extended its life by adding promotion tiers over decades. [Inven Global](https://www.invenglobal.com/articles/25786/the-kingdom-of-the-winds-overhauls-life-and-combat-content-in-refresh-update)
- Party quests, guild names under character names and the Free Market as a gathering place built community. [MapleSEA guide](https://www.maplesea.com/guide/other_features/party)
- Probability disclosure scandal (2021) and a 11.6 billion won fine (2024) for changing odds without notice. [주간경향](https://weekly.khan.co.kr/article/202102261419341)
- Long-running MMO lessons: content bloat overwhelms newcomers, a catch-up curve is essential. [Engadget, GDC Online 2010](https://www.engadget.com/2010/10/09/gdco-2010-running-mmos-for-the-long-haul/)

**Used in this plan:** 전직 by school year, shared hunting fields by level band, 동아리 names under characters, a market that doubles as a hangout, disclosed odds with pity, catch-up multipliers.

### B.2 Idle 키우기 genre

- Twice-a-day login loop: claim the pool, run dailies, log out. Offline progress capped at 8 hours in MapleStory Idle. [MuMu guide](https://www.mumuplayer.com/blog/maplestory-idle-rpg-afk-guide.html)
- Costs growing about 15% per level and prestige currencies as a root of earnings are genre standards. [Game Developer, The Math of Idle Games](https://gamedeveloper.com/design/the-math-of-idle-games-part-iii)
- Offline caps and exponential soft limits. [Kongregate GDC Europe 2016 slides](https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507)
- The genre's light image has eroded under login pressure, guild wars and small payments. [디지털타임스](https://v.daum.net/v/20260727160707467)

**Used in this plan:** the 8-hour 자습 pool, 15% cost growth for 필기, a short daily board, no paid layer at all.

### B.3 Survivor-likes and combat feel

- Evolutions from a maxed weapon plus a linked passive. [PC Gamer](https://pcgamer.com/vampire-survivors-evolve-weapons-evolutions-guide)
- Short waves with a shop between them, tier merging of duplicates. [Brotato release notes](https://www.gamespress.com/Brotato-10-Release)
- Boss warnings, cleared and confined arenas, blueprint-based gear upgrades. [PocketGamer.biz on Survivor.io](https://www.pocketgamer.biz/feature/79592/how-innovation-and-iteration-has-transformed-survivorio/)
- Hitstop of 2 to 3 frames for light hits and 6 to 10 for heavy, on attacker and target. [Godot forum game-feel checklist](https://forum.godotengine.org/t/game-feel-checklist-for-godot-4-hit-stop-trauma-shake-coyote-time-and-more/145340)
- Decaying trauma value, squared, for screen shake. [Godot forum](https://forum.godotengine.org/t/game-feel-effects-that-stack-without-fighting-your-code-trauma-shake-real-time-hit-stop-and-apply-the-difference/146379)
- Physics engines fail at thousands of enemies. Use a spatial grid and custom separation. [Knightmare devlog](https://avskum.itch.io/knightmare/devlog/845920/solving-enemy-blob-performance-issues-distance-based-optimizations)
- BrowserQuest's WebSocket world instances. [Mozilla Hacks](https://hacks.mozilla.org/2012/03/browserquest/)
- Low-population world bosses: kill-count triggers and scaled strength. [ChronoRO wiki](https://chrono-realm.com/wiki/index.php/World_Boss_Event)

**Used in this plan:** book and tool evolutions, forging three copies into a higher grade, wave and lull field pacing, the hit-feel table, custom physics, calibrated boss HP.

### B.4 Technology

- Phaser 4 stable since April 2026, 4.2.1 current. [Releases](https://github.com/phaserjs/phaser/releases), [v4 changelog](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/CHANGELOG-v4.0.0.md), [Phaser 4 overview](https://phaser.io/phaser4)
- Pixel-art config and Scale Manager. [Core config types](https://docs.phaser.io/api-documentation/typedef/types-core), [Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager)
- Colyseus 0.18: state, rooms, 50 ms default patch rate, deployment behind a proxy. [State](https://docs.colyseus.io/state), [Room](https://docs.colyseus.io/room), [Deployment](https://docs.colyseus.io/deployment/), [FAQ](https://docs.colyseus.io/faq)
- Per-client filtered state with `StateView`. [StateView](https://docs.colyseus.io/state/view)
- Colyseus auth module (not used here, since login is ID and password without email). [Auth](https://docs.colyseus.io/auth)
- Phaser and Colyseus tutorial, older versions. [Repository](https://github.com/colyseus/tutorial-phaser)
- OWASP Argon2id parameters. [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- Caddy reverse proxy with automatic HTTPS. [Quick start](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- VPS: Vultr plan API, Lightsail pricing, Oracle Always Free limits. [Vultr](https://api.vultr.com/v2/plans?type=vhf), [Lightsail](https://aws.amazon.com/lightsail/pricing/), [Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

**Open technical checks for M0:** Tiled-format tilemap support and the particle API in Phaser 4, Node 24 against Colyseus's engine requirement, `StateView` cost with dense hordes.

### B.5 Korean release rules

- Non-profit rating exemption. [문화체육관광부 보도자료](https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=17434), [시행령](https://www.law.go.kr/법령/게임산업진흥에관한법률시행령/제2조)
- Probability item disclosure scope. [정책브리핑](https://www.korea.kr/news/policyNewsView.do?newsId=148922651), [법률신문](https://www.lawtimes.co.kr/news/articleView.html?idxno=210245)
- Privacy policy contents and safeguards. [개인정보 처리방침 해설](https://wikidocs.net/230549), [안전성 확보조치 개정](https://www.lawtimes.co.kr/news/articleView.html?idxno=213530)
- 셧다운제 abolition. [정책브리핑](https://www.korea.kr/news/policyBriefingView.do?newsId=156467712)
- Einstein publicity ruling. [Techdirt](https://www.techdirt.com/2012/10/30/judge-rejects-einstein-publicity-rights-claim-playing-dice-with-law/), [CDAS](https://cdas.com/einstein-publicity-rights-deemed-expired-by-california-federal-court/)

### B.6 Code-drawn pixel art

- Palette references and ramp rules. [Lospec palette list](https://lospec.com/palette-list/resurrect-64), [Slynyrd Pixelblog](https://www.slynyrd.com/blog), [saint11 tutorials](https://saint11.art/blog/pixel-art-tutorials/)
- Palette swapping in Phaser. [Phaser palette cycling article](https://phaser.io/news/2025/11/recreating-earthbounds-palette-cycling-effect), [Phaser forum thread](https://phaser.discourse.group/t/how-to-get-different-postfx-shader-settings-for-different-objects/15391)
- Autotiling. [Red Blob Games](https://www.redblobgames.com/articles/autotile/), [dual-grid reference](https://github.com/jamesplease/dual-grid-tilemap-system-godot-gdscript), [Boris the Brave](https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/)

**Used in this plan:** text-grid sprites compiled with `pngjs`, a project-owned palette, baked era themes with a lookup shader only for character colors, dual-grid tiles, the contact sheet and automated pixel checks.

---

## Appendix C: Science-history fact check

Each boss's wrong theory was checked. Verdicts come from the research pass, which drew on general knowledge with canonical reference pages, so each codex entry gets one more read against its source before it ships.

| Page | Claim used in the game | Verdict | How the game handles the nuance | Reference |
|---|---|---|---|---|
| 1 | The Pythagoreans held that everything is whole-number ratio | Partly | The boss is the school, 피타고라스 학파. The Hippasus drowning is told as legend | [MacTutor](https://mathshistory.st-andrews.ac.uk/Biographies/Hippasus/), [SEP](https://plato.stanford.edu/entries/pythagoras/) |
| 1 | Zeno argued motion is impossible | Partly | Framed as defending Parmenides: motion and plurality are incoherent | [SEP](https://plato.stanford.edu/entries/paradox-zeno/) |
| 1 | Aristotle: heavier falls faster, motion needs a mover, four elements | Accurate | Philoponus's early criticism appears in the codex | [SEP](https://plato.stanford.edu/entries/aristotle-physics/) |
| 2 | Euclid as a boss for the parallel postulate | Weak | Replaced by 프로클로스, who tried to prove the postulate. Euclid appears as a neutral NPC | [MacTutor](https://mathshistory.st-andrews.ac.uk/HistTopics/Non-Euclidean_geometry/) |
| 2 | Ptolemy's geocentric model with epicycles | Accurate | | [Britannica](https://www.britannica.com/biography/Ptolemy-Greco-Egyptian-astronomer) |
| 2 | Galen: humors, animal dissection, blood consumed | Accurate | Blood ebbs and flows through invisible pores. He also proved arteries carry blood, which the codex credits | [Britannica](https://www.britannica.com/biography/Galen) |
| 3 | Al-Khwarizmi rejected negative roots | Partly | The codex notes Brahmagupta already used negatives | [MacTutor](https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/) |
| 3 | Jabir and the sulfur-mercury theory | Partly | The codex notes the many authors of the Jabir corpus. Ibn al-Haytham is called an early experimentalist | [SEP](https://plato.stanford.edu/entries/ibn-al-haytham/) |
| 4 | Paracelsus and the tria prima | Accurate | | [Britannica](https://www.britannica.com/biography/Paracelsus) |
| 4 | Van Helmont's mice recipe and willow conclusion | Accurate | Used for monsters. Published after his death | [Britannica](https://www.britannica.com/biography/Jan-Baptista-van-Helmont) |
| 4 | Tycho's hybrid system. Galileo on tides, circles, ellipses | Accurate | Galileo's claim that comets are optical illusions was added | [SEP](https://plato.stanford.edu/entries/galileo/) |
| 5 | Descartes' vortices. Infinitesimals without rigor | Accurate | The codex credits Berkeley's critique and later rigor from Cauchy and Weierstrass | [SEP](https://plato.stanford.edu/entries/berkeley/) |
| 5 | Newton: alchemy, corpuscles, absolute space and time | Accurate | The codex notes his optics mixed particles with aether | [SEP](https://plato.stanford.edu/entries/newton-stm/) |
| 6 | Priestley's phlogiston. Lavoisier's caloric | Accurate | Lavoisier's oxygen-as-acid-former error was added | |
| 6 | Galvani's animal electricity as the wrong theory | Mixed | Galvani was right about bioelectricity. The boss is now 볼타 and his pure contact theory | [Britannica](https://www.britannica.com/biography/Alessandro-Volta) |
| 7 | Lamarck, Pouchet, Darwin's pangenesis | Accurate | The codex notes Darwin also accepted acquired inheritance, and that Mendel was read and not understood | [Pangenesis](https://en.wikipedia.org/wiki/Pangenesis) |
| 8 | Maxwell's mechanical aether. Michelson. Kelvin's age of the Earth | Mostly | Kelvin's range is 20 to 40 million years by 1897. Only his documented 1896 remark on flight is used | [Age of the Earth](https://en.wikipedia.org/wiki/Age_of_the_Earth) |
| 9 | Dalton's indivisible atoms and HO | Accurate | | |
| 9 | Mendeleev resisted the electron | Unverified | The boss uses only his documented ether-as-element proposal | |
| 9 | Thomson's plum pudding model, 1904 | Accurate | | [Nobel Prize](https://www.nobelprize.org/prizes/physics/1906/thomson/biographical/) |
| 10 | Suess's contracting Earth. Lowell's canals. Wegener's mechanism | Accurate | Wegener's proposed forces and his overestimated drift rate are both in the fight | [Britannica](https://www.britannica.com/biography/Alfred-Wegener) |
| 11 | Kronecker, Frege, Hilbert | Accurate | The codex is precise: Gödel undercut the finitary consistency program | [SEP](https://plato.stanford.edu/entries/hilbert-program/) |
| 12 | Planck, Rutherford, Einstein | Accurate | The "biggest blunder" phrase is second-hand through Gamow, so the game leaves it out | [SEP](https://plato.stanford.edu/entries/qt-epr/) |
| 12 | Laplace's demon and what defeats it | Accurate | Three phases: quantum indeterminacy with Bell tests, chaos, relativity | [SEP](https://plato.stanford.edu/entries/determinism-causal/) |

**Allies by Page.** 1 아리스타르코스 · 2 히파티아, 에라토스테네스 · 3 이븐 알하이삼 · 4 케플러, 소피 브라헤 · 5 에밀리 뒤 샤틀레 · 6 마리 안 폴즈 라부아지에 · 7 멘델 · 8 패러데이, 헤르타 에어턴 · 9 마리 퀴리 · 10 잉에 레만, 마리 타프 · 11 칸토어, 괴델 · 12 보어, 하이젠베르크, 에미 뇌터, 리제 마이트너
