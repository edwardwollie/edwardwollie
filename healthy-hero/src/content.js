// Healthy Hero — learning content. 72 wellness encounters (12 per topic), family play,
// topic facts for Wellness Island, Move Break moves and hero lines. Educational play only:
// no weight, calorie, appearance or body-shaming mechanics, and not medical advice.

export const WORLDS=[
  {key:'garden',name:'Fuel Garden',icon:'🍎',badge:'Rainbow Ranger',color:'#ff695f',topic:'Food'},
  {key:'falls',name:'Hydration Falls',icon:'💧',badge:'Water Wizard',color:'#49d9ff',topic:'Water'},
  {key:'mountain',name:'Move Mountain',icon:'⚡',badge:'Motion Master',color:'#ffd45b',topic:'Movement'},
  {key:'sky',name:'Sleep Sky',icon:'🌙',badge:'Rest Ranger',color:'#b889ff',topic:'Sleep'},
  {key:'harbor',name:'Hygiene Harbor',icon:'🫧',badge:'Clean Champion',color:'#63f2c0',topic:'Hygiene'},
  {key:'grove',name:'Calm Grove',icon:'🌿',badge:'Calm Captain',color:'#8af06a',topic:'Feelings'}
];

export const Q=[
  [0,'Which snack gives the hero a colorful plant power-up?',['Candy only','Apple slices and yogurt','Nothing all day'],1,'Great choice! Fruit and yogurt can give the body useful energy and nutrients.','Look for a fruit plus another food group.'],
  [0,'A rainbow plate mission asks for what?',['Several colors of fruits or vegetables','Only one beige food','Food arranged by price'],0,'Different-colored fruits and vegetables offer different nutrients.','Think about natural food colors.'],
  [0,'The hero is hungry before active play. What is a helpful move?',['Ignore hunger','Choose a balanced snack with a grown-up','Eat an unknown item'],1,'A balanced snack can help the body feel ready for play.','Ask a grown-up and combine food groups.'],
  [0,'What does “listen to your body” mean at mealtime?',['Notice hunger and fullness signals','Always clean every plate','Skip meals to earn points'],0,'Bodies give hunger and fullness clues. A trusted grown-up can help children respond.','Your body gives signals.'],
  [0,'Which breakfast team has several food groups?',['Oatmeal, berries, and milk or a suitable alternative','Only a fizzy drink','Nothing until dinner'],0,'Combining grains, fruit, and a protein or dairy choice can make a balanced start.','Choose a team, not a single sugary item.'],
  [0,'A new healthy food seems strange. What is a brave, pressure-free step?',['Try a small taste when ready','Force someone to eat it','Call the food bad'],0,'Children can explore new foods without pressure. It can take many tries to like something.','Small and calm is brave.'],

  [1,'After running and playing, what helps replace fluid?',['Water','More screen brightness','Skipping drinks'],0,'Water helps the body replace fluid lost during active play.','Choose the clear drink your body needs.'],
  [1,'How can the hero remember to drink water?',['Keep a water bottle nearby with a grown-up’s help','Wait until bedtime only','Hide every cup'],0,'A visible bottle or regular water breaks can make hydration easier.','Make water easy to reach.'],
  [1,'What can make water more fun without lots of sugar?',['Add fruit slices with a grown-up','Add several spoonfuls of salt','Never wash the cup'],0,'Fruit slices can add flavor. A grown-up can help prepare them safely.','A fruit can flavor water.'],
  [1,'The hero feels thirsty. What does that signal mean?',['The body may need fluid','The body needs loud music','The body should avoid drinks'],0,'Thirst is one clue that the body may need water.','Listen to the body clue.'],
  [1,'On a hot day, the best plan includes what?',['Regular water and shade breaks','A heavy coat and no drinks','Running nonstop'],0,'Water, shade, and rest breaks help active play feel safer in heat.','Cool down and drink.'],
  [1,'Which drink is the everyday hydration champion?',['Water','Energy drinks for children','Unknown liquids'],0,'Water is a strong everyday choice. Families can follow their own health guidance.','The simplest drink wins.'],

  [2,'What counts as movement power?',['Dancing, walking, stretching, or active play','Only winning a race','Sitting perfectly still all day'],0,'Many kinds of movement count. The best movement is enjoyable and fits the child.','Movement has many forms.'],
  [2,'Before a fast game, what prepares muscles and joints?',['A gentle warm-up','Jumping in at full speed','Skipping all movement'],0,'A gentle warm-up helps the body get ready to move.','Start easy, then build.'],
  [2,'The hero feels pain while moving. What should happen?',['Stop and tell a trusted grown-up','Hide it and keep pushing','Compete harder'],0,'Pain is a signal to stop and get help from a trusted grown-up.','Pain is not a score.'],
  [2,'What makes a movement challenge fair and fun?',['Everyone can choose a comfortable level','Only the fastest player matters','Teasing people who rest'],0,'Movement can be adjusted so every body can participate comfortably.','Different bodies need different choices.'],
  [2,'After active play, what is a good cooldown?',['Slow walking and gentle breathing','Stop instantly in a dangerous place','Skip water all day'],0,'A gradual cooldown helps the body shift from active play to rest.','Slow down gradually.'],
  [2,'How much movement should this game prescribe for every child?',['None; families follow professional guidance','Exactly the same amount for everyone','More whenever someone feels pain'],0,'Children differ. Families can use guidance from pediatric professionals and trusted adults.','One plan does not fit every child.'],

  [3,'What helps the brain know bedtime is coming?',['A calm, consistent routine','Bright action games all night','A different bedtime every minute'],0,'A predictable wind-down routine can help the body prepare for sleep.','Calm and consistent.'],
  [3,'Which room setup usually supports sleep?',['Cool, quiet, comfortable, and dim','Very loud and flashing','Filled with active screens'],0,'A calm, comfortable sleep space can make resting easier.','Think calm and dim.'],
  [3,'Why does sleep matter for young heroes?',['It supports learning, mood, growth, and recovery','It makes water unnecessary','It replaces every meal'],0,'Sleep supports many body and brain jobs, including learning and recovery.','The body does important work while resting.'],
  [3,'A worry keeps the hero awake. What is a helpful step?',['Tell a trusted grown-up','Keep it secret forever','Use a stranger’s medicine'],0,'A trusted grown-up can listen and help build a safe bedtime plan.','Heroes ask for support.'],
  [3,'What is a gentle screen-time bedtime move?',['Put screens away during the wind-down routine','Turn brightness to maximum','Watch more exciting videos in bed'],0,'Putting screens away can help the brain shift toward sleep.','Let the brain slow down.'],
  [3,'Who decides a child’s sleep schedule and health needs?',['The family with professional guidance when needed','An online stranger','A game score'],0,'Families know their child and can ask a pediatric professional for guidance.','The game does not prescribe care.'],

  [4,'How long should a careful hand wash last?',['About twenty seconds with soap and water','One quick splash','Until the towel gets wet'],0,'Scrub fronts, backs, between fingers, and around nails for about twenty seconds.','Sing a short handwashing song.'],
  [4,'When is handwashing especially useful?',['Before eating and after using the bathroom','Only on birthdays','Never after outdoor play'],0,'Handwashing before eating and after bathroom use helps reduce the spread of germs.','Think food and bathroom.'],
  [4,'What is a tooth-brushing power move?',['Brush gently with help and guidance from a grown-up','Share every toothbrush','Chew the toothbrush'],0,'Gentle brushing with the right toothpaste and family guidance helps care for teeth.','A toothbrush is personal.'],
  [4,'Where should a cough or sneeze go?',['Into a tissue or elbow','Into another person’s face','Onto shared food'],0,'Cover with a tissue or elbow, then wash hands when needed.','Cover, toss, wash.'],
  [4,'Should friends share combs, toothbrushes, or used towels?',['No, keep personal-care items personal','Yes, always','Only if they are wet'],0,'Personal-care items should not be shared because they can spread germs.','Personal means one person.'],
  [4,'A cut needs cleaning. Who should help?',['A trusted grown-up','An online stranger','Nobody, even if it is serious'],0,'Tell a trusted grown-up so they can give appropriate first aid or seek medical care.','Ask for safe grown-up help.'],

  [5,'The hero feels overwhelmed. What can help in the moment?',['Pause and take slow comfortable breaths','Pretend feelings never happen','Break something'],0,'A short pause and slow breathing can help the body settle.','Pause, breathe, notice.'],
  [5,'What is true about feelings?',['All feelings can be named and shared safely','Only happy feelings are allowed','Feelings make someone bad'],0,'All feelings are valid signals. Actions still need to be safe and kind.','Feelings are signals.'],
  [5,'A friend looks sad. What is a caring response?',['Ask if they want help and tell a grown-up when needed','Laugh at them','Demand a secret'],0,'Kind listening and trusted grown-up support can help.','Check in without pressure.'],
  [5,'Which calm-down tool is quiet and portable?',['Five-finger breathing','Shouting at everyone','Holding your breath too long'],0,'Trace one finger slowly up and down the other hand while breathing comfortably.','Use your hand as a guide.'],
  [5,'When a big feeling will not go away, what should a child do?',['Tell a trusted grown-up','Hide forever','Follow unsafe online advice'],0,'Trusted adults can listen and connect a child with appropriate support.','Asking for help is strong.'],
  [5,'What makes a strong wellness team?',['The child, family, trusted adults, and health professionals when needed','One game alone','A secret online group'],0,'Real people who know the child provide care and guidance. This game only supports conversation.','People—not points—are the care team.'],

  [0,'A lunchbox mission needs a simple balanced team. Which choice fits best?',['A sandwich or wrap, fruit or vegetable, and water','Only candy','No food or drink all day'],0,'A mix of food groups can help provide energy and nutrients. Families can adapt choices for allergies, culture, and guidance.','Build a team of foods rather than one treat.'],
  [0,'The hero wants a crunchy snack. Which is a helpful option with a grown-up?',['Carrot sticks or apple slices prepared safely','Ice cubes as the whole snack','An unknown plant from outside'],0,'Prepared fruits or vegetables can be a crunchy snack. A grown-up can make sure pieces are safe for the child.','Choose familiar food prepared safely.'],
  [0,'What is a kind way to talk about food?',['Describe how it tastes, feels, or helps us—not as good or bad people','Call someone bad for eating dessert','Tease a friend about lunch'],0,'Food does not decide whether someone is good or bad. Curious, neutral language keeps mealtimes kinder.','Food choices are not character grades.'],
  [0,'A child has a food allergy. What is the safest game-day plan?',['Follow the family allergy plan and ask a trusted grown-up','Trade snacks without asking','Guess which foods are safe'],0,'Families and health professionals set allergy plans. Children should check with a trusted grown-up before eating unfamiliar foods.','Do not guess about allergies.'],
  [0,'What can help make trying a new food less stressful?',['Explore its color, smell, or texture without pressure','Force a big bite','Hide it in someone’s meal'],0,'Pressure-free exploring can help children become familiar with foods at their own pace.','Curiosity works better than pressure.'],
  [0,'The hero is full before the plate is empty. What is a helpful next step?',['Notice the fullness signal and tell a grown-up','Keep eating for points','Hide the food'],0,'Fullness is one body signal. Families can help children learn to notice it without turning meals into a contest.','Listen to body signals.'],

  [1,'The hero packs for the playground. What belongs in the hydration kit?',['A clean water bottle','An unwashed mystery cup','Nothing to drink'],0,'A clean water bottle makes regular water breaks easier during active play.','Bring clean water.'],
  [1,'Why are water breaks useful during active play?',['They give the body chances to replace fluid','They make helmets unnecessary','They replace sleep'],0,'Regular drink breaks can help the body replace fluid during activity, especially in warm weather.','Think fluid replacement.'],
  [1,'A friend offers an energy drink. What should a child do?',['Check with a trusted grown-up and choose the family’s approved drink','Drink it because the can is colorful','Hide it from adults'],0,'Children should follow family and health-professional guidance about drinks. Water is a common everyday hydration choice.','Ask a trusted grown-up first.'],
  [1,'After playing outside, the water bottle is empty. What is the smart move?',['Refill it from a safe source with a grown-up’s help','Drink from a puddle','Ignore thirst all day'],0,'Use a safe drinking-water source and ask a trusted grown-up when you are unsure.','Safe source, then refill.'],
  [1,'What is a good bottle-care habit?',['Wash reusable bottles regularly','Share the same mouthpiece with everyone','Leave old drinks in it for days'],0,'Regular cleaning helps keep reusable bottles ready for the next hydration break.','Clean gear matters.'],
  [1,'The hero is playing in hot weather and starts feeling unwell. What should happen?',['Stop, get to a cooler place, and tell a trusted grown-up','Keep racing to finish the level','Hide how you feel'],0,'Feeling unwell in heat is a reason to stop activity and get help from a trusted grown-up.','Stop and get help.'],

  [2,'Which activity can count as movement even if it is not a sport?',['Dancing to a favorite song','Only sitting to watch a race','Holding completely still'],0,'Movement can be playful and does not have to be a competitive sport.','Fun movement counts.'],
  [2,'A movement feels too difficult today. What is a strong choice?',['Choose an easier version or rest','Push through pain','Tease yourself'],0,'Adjusting an activity or resting is a useful way to respect body signals.','Change the challenge to fit your body.'],
  [2,'Why is personal space important during active play?',['It helps everyone move more safely','It lets you bump people on purpose','It makes warm-ups unnecessary'],0,'Enough space helps reduce accidental collisions during movement games.','Give every mover room.'],
  [2,'What is a teamwork move during a family activity?',['Encourage each person’s comfortable pace','Compare bodies','Make the slowest person quit'],0,'Encouragement and flexible pacing help more people enjoy movement together.','Support, do not compare.'],
  [2,'The floor is slippery before a dance challenge. What should you do?',['Tell a grown-up and choose a safer space','Run faster on it','Ignore the hazard'],0,'A safer surface and clear play area can reduce slips and collisions.','Fix the play space first.'],
  [2,'What should happen after a hard movement if someone feels dizzy or unwell?',['Stop and tell a trusted grown-up','Keep going for bonus points','Hide the feeling'],0,'Feeling dizzy or unwell is a reason to stop and get help from a trusted grown-up.','Stop and speak up.'],

  [3,'What can make a wind-down routine easier to remember?',['Doing a few calm steps in a similar order','Changing everything every night','Starting a loud competition in bed'],0,'A familiar sequence can cue that the day is winding down.','Repeat calm steps.'],
  [3,'Which activity fits a calm wind-down better?',['A quiet story or gentle music','A bright, fast action challenge','A shouting contest'],0,'Quiet activities can help the household shift toward rest.','Choose lower-energy activities.'],
  [3,'The hero wakes during the night and feels scared. What is a helpful plan?',['Use the family’s safe plan and get a trusted grown-up if needed','Leave home alone','Take unknown medicine'],0,'Families can make a safe nighttime plan, and children can ask a trusted grown-up for help.','Use the family plan.'],
  [3,'Why should medicine not be used as a sleep game power-up?',['Medicine is only used as directed by a responsible adult or health professional','Any medicine is fine if you are tired','More medicine always means more rest'],0,'Children should never choose or take medicine on their own. Responsible adults and health professionals guide medicine use.','Medicine is not a game item.'],
  [3,'What is a helpful way to make mornings less rushed?',['Prepare simple items the night before with family','Stay up later to find things','Skip needed routines'],0,'Preparing clothes, bags, or other items ahead can make the morning routine calmer for some families.','Prepare before bedtime when helpful.'],
  [3,'Who should a family ask about ongoing sleep concerns?',['A qualified health professional','A game leaderboard','An anonymous stranger'],0,'A qualified health professional can help families with ongoing sleep concerns.','Games do not diagnose sleep problems.'],

  [4,'After blowing your nose, what is a helpful next step?',['Wash or clean your hands appropriately','Wipe hands on shared food','Touch everyone’s face'],0,'Cleaning hands after handling a used tissue can help reduce germ spread.','Tissue, then clean hands.'],
  [4,'Why should toothbrushes be stored separately when possible?',['They are personal-care items','They work better when shared','They never need to dry'],0,'Keeping toothbrushes personal and allowing them to dry helps with everyday hygiene routines.','Keep personal items personal.'],
  [4,'The hero finds a used bandage on the ground. What should a child do?',['Avoid touching it and tell a trusted grown-up','Pick it up with bare hands','Play with it'],0,'A trusted grown-up can handle potentially contaminated waste appropriately.','Do not handle used medical waste.'],
  [4,'What is a helpful shower or bath safety habit?',['Use a safe temperature and follow family supervision rules','Make the water as hot as possible','Run on a wet floor'],0,'Families can set safe water temperatures and supervision routines. Wet floors can also be slippery.','Warm, supervised, and careful.'],
  [4,'When should a child tell a grown-up about a tooth or mouth problem?',['When there is pain, injury, or something concerning','Never','Only after trying unknown remedies'],0,'A trusted grown-up can decide whether dental or medical care is needed.','Speak up about pain or injury.'],
  [4,'What should happen before using a new skin or hygiene product?',['Follow family guidance and directions','Taste it first','Mix random products together'],0,'Families can check labels, allergies, and directions before a child uses a new product.','Check first; do not experiment.'],

  [5,'The hero is frustrated after a mistake. What is a helpful self-talk line?',['I can try again or ask for help','I must be perfect','Mistakes mean I am bad'],0,'Kind self-talk can make it easier to learn from mistakes and choose the next step.','Talk to yourself like a teammate.'],
  [5,'What can help when a task feels too big?',['Break it into smaller steps with help','Pretend it does not exist forever','Destroy the materials'],0,'Smaller steps and trusted support can make a difficult task feel more manageable.','One small step at a time.'],
  [5,'A friend says they need space to calm down. What is a respectful response?',['Give safe space and get a trusted adult if needed','Follow them and tease','Demand they talk immediately'],0,'Respecting safe boundaries can be part of caring for a friend. A trusted adult can help when needed.','Respect the boundary.'],
  [5,'Which is a healthy way to celebrate progress?',['Notice effort, learning, or kindness','Compare bodies','Only praise being the fastest'],0,'Celebrating effort, learning, and kindness supports many different strengths.','Praise growth, not comparison.'],
  [5,'A big feeling is making it hard to stay safe. What should a child do?',['Move to a safer place and get a trusted grown-up','Keep it secret','Use an unsafe dare'],0,'Getting a trusted grown-up is a strong safety step when emotions feel hard to manage.','Safety first, then support.'],
  [5,'What can a calm corner include?',['Comfortable, family-approved items for settling and communicating','Dangerous tools','Secret medicines'],0,'A family can choose safe sensory or comfort items that help a child pause and communicate.','Safe and family-approved.']
].map(([zone,q,choices,answer,explain,hint],id)=>({id,zone,q,choices,answer,explain,hint}));

export const FAMILY=[
  ['Rainbow Plate Hunt','With a grown-up, find or draw five different-colored fruits and vegetables. No tasting is required.'],
  ['Water Station Mission','Decorate a reusable water-bottle tag and choose a family reminder spot.'],
  ['Choose-the-Move Dice','Roll a die: march, dance, reach, tiptoe, balance, or choose your own comfortable move.'],
  ['Cozy Wind-down Builder','Together, choose three calm bedtime steps such as wash, story, cuddle, or quiet music.'],
  ['Twenty-Second Bubble Beat','A grown-up leads a handwashing song while everyone practices fronts, backs, fingers, and nails.'],
  ['Feelings Weather Report','Each person names their feeling as weather—sunny, cloudy, stormy, or mixed—and one helpful support.']
];

export const TUTORIAL=[
  ['Run through the Power Worlds','Your hero runs on their own. Every Power Gate asks a wellness question from a different world.'],
  ['Listen, then think','The question and all three answers are read out loud. The gates wait while you listen, then give you 7 seconds of thinking time before they move.'],
  ['Choose a power lane','Tap an answer card, use A and D or the arrow keys, or swipe left and right. Steering is how you answer.'],
  ['Dash when you are ready','Press W, the Up arrow, swipe up, or tap DASH. If you wait, your hero reaches the gate when the timer ends.'],
  ['Learn a Power Fact','A helpful answer bursts the gate open. A miss is a gentle crash-through and shows the helpful answer. Either way you learn a Power Fact and keep running!']
];

export const LANES=[
  {name:'Lane 1',shape:'▲',color:'#ff9f43'},
  {name:'Lane 2',shape:'●',color:'#4dabff'},
  {name:'Lane 3',shape:'◆',color:'#c06cff'}
];

// Short, gentle facts read aloud when a child taps a world monument on Wellness Island.
export const TOPIC_FACTS=[
  ['Fuel Garden is all about food that helps bodies play, learn, and grow.','A colorful plate with different fruits and vegetables brings different nutrients.','Bodies send hunger and fullness signals. A trusted grown-up can help you listen to them.'],
  ['Hydration Falls is all about water.','Water helps your body after running and playing, especially on hot days.','A clean water bottle nearby makes water breaks easy to remember.'],
  ['Move Mountain is all about moving in ways that feel good.','Dancing, walking, stretching, rolling, and playing all count as movement.','Warm up gently first, and stop and tell a grown-up if something hurts.'],
  ['Sleep Sky is all about rest.','Sleep helps your brain learn and your body recover.','A calm, cozy bedtime routine helps your body know it is time to rest.'],
  ['Hygiene Harbor is all about keeping germs away.','Wash with soap and water for about twenty seconds, fronts, backs, between fingers, and nails.','Cough or sneeze into a tissue or your elbow. Keep toothbrushes and combs personal.'],
  ['Calm Grove is all about feelings.','All feelings are okay to name and share. Actions still need to be safe and kind.','Slow, comfortable breaths and talking to a trusted grown-up can help big feelings.']
];

// Move Break: 6 moves x 10 seconds. Every move has a seated or easier option.
export const MOVES=[
  {id:'march',name:'March in place',tip:'Lift your knees like a parade hero.',easy:'Seated: tap your feet or march your arms.'},
  {id:'reach',name:'Reach for the stars',tip:'Stretch your arms up high, then relax.',easy:'Seated: reach up one arm at a time.'},
  {id:'sideStretch',name:'Side stretch',tip:'Reach over to one side, then the other.',easy:'Seated: lean gently side to side.'},
  {id:'armCircles',name:'Arm circles',tip:'Make slow circles with your arms.',easy:'Make tiny circles with your hands.'},
  {id:'balance',name:'Flamingo balance',tip:'Balance on one foot, or keep both feet down.',easy:'Hold a chair or wall, or balance a toy on your hand.'},
  {id:'wiggle',name:'Wiggle dance',tip:'Wiggle and dance any way you like!',easy:'Wiggle your shoulders, fingers, or head.'}
];

export const STAR_LINES=['Nice running!','Great thinking!','Power hero!'];
