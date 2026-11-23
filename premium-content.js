// Conteúdo exclusivo do Premium. Fica no servidor e só é enviado
// pela rota /api/premium/content para assinaturas autorizadas.
module.exports = {
  plan: 'Projeto Seca Saudável Premium',
  price: 'R$ 19,90/mês',
  benefits: [
    '12 receitas práticas com modo de preparo',
    '7 cardápios extras para variar a semana',
    'Plano de treino progressivo de 4 semanas',
    '4 desafios bônus semanais'
  ],
  recipes: [
    { title: 'Panqueca de banana e aveia', time: '10 min', ingredients: ['1 banana madura', '1 ovo', '3 colheres (sopa) de aveia', 'Canela a gosto'], steps: ['Amasse a banana e misture com o ovo e a aveia.', 'Aqueça uma frigideira antiaderente untada levemente.', 'Despeje a massa, doure dos dois lados e finalize com canela.'] },
    { title: 'Omelete de forno com legumes', time: '25 min', ingredients: ['4 ovos', '1 tomate picado', '1/2 cenoura ralada', '1 xícara de espinafre', 'Sal, pimenta e orégano'], steps: ['Bata os ovos com os temperos.', 'Misture os legumes e coloque em forma untada.', 'Asse a 200 °C por 15 a 20 minutos, até firmar.'] },
    { title: 'Frango desfiado com legumes', time: '30 min', ingredients: ['300 g de peito de frango cozido e desfiado', '1 cebola', '1 abobrinha em cubos', '1 cenoura em cubos', 'Alho, sal e cheiro-verde'], steps: ['Refogue a cebola e o alho com um fio de azeite.', 'Junte cenoura e abobrinha e cozinhe até ficarem macias.', 'Adicione o frango, ajuste o sal e finalize com cheiro-verde.'] },
    { title: 'Salada de grão-de-bico', time: '15 min', ingredients: ['1 xícara de grão-de-bico cozido', '1 tomate', '1/2 pepino', '1/4 de cebola roxa', 'Limão, azeite e salsinha'], steps: ['Pique os vegetais em cubos pequenos.', 'Misture com o grão-de-bico.', 'Tempere com limão, um fio de azeite, sal e salsinha.'] },
    { title: 'Peixe assado com batata e brócolis', time: '35 min', ingredients: ['2 filés de tilápia', '2 batatas em rodelas', '1 maço pequeno de brócolis', 'Limão, alho, sal e páprica'], steps: ['Tempere o peixe com limão, alho e sal.', 'Disponha batatas e brócolis em uma assadeira com o peixe por cima.', 'Cubra com papel-alumínio e asse a 200 °C por 25 minutos; retire o papel e doure por mais 5.'] },
    { title: 'Sopa de lentilha e abóbora', time: '35 min', ingredients: ['1 xícara de lentilha', '2 xícaras de abóbora em cubos', '1 cebola', '2 dentes de alho', 'Cominho, sal e água'], steps: ['Refogue cebola e alho.', 'Adicione lentilha, abóbora e água até cobrir com folga.', 'Cozinhe por 25 minutos, tempere e sirva (pode bater metade no liquidificador para engrossar).'] },
    { title: 'Escondidinho de carne moída e mandioca', time: '45 min', ingredients: ['500 g de mandioca cozida', '300 g de carne moída magra', '1 tomate', '1 cebola', 'Leite e queijo ralado (opcional)'], steps: ['Amasse a mandioca com um pouco de leite até virar purê.', 'Refogue a carne com cebola e tomate.', 'Monte em camadas (purê, carne, purê), polvilhe queijo e leve ao forno por 15 minutos.'] },
    { title: 'Wrap integral de frango', time: '10 min', ingredients: ['1 pão folha integral', '3 colheres (sopa) de frango desfiado', 'Folhas de alface', 'Tomate e cenoura ralada', '1 colher (sopa) de iogurte natural'], steps: ['Espalhe o iogurte no pão folha.', 'Recheie com frango e vegetais.', 'Enrole bem e aqueça rapidamente na frigideira, se preferir.'] },
    { title: 'Iogurte com frutas e sementes', time: '5 min', ingredients: ['1 pote de iogurte natural', '1/2 xícara de frutas picadas', '1 colher (sopa) de aveia', '1 colher (chá) de chia'], steps: ['Coloque o iogurte em um copo.', 'Cubra com as frutas, a aveia e a chia.', 'Sirva na hora ou guarde na geladeira por até 1 dia.'] },
    { title: 'Arroz integral colorido', time: '40 min', ingredients: ['1 xícara de arroz integral', '1/2 pimentão picado', '1 cenoura ralada', '1/2 xícara de ervilha', 'Cebola, alho e sal'], steps: ['Refogue cebola e alho e acrescente o arroz.', 'Adicione 2 e 1/2 xícaras de água quente e cozinhe em fogo baixo.', 'Faltando 10 minutos, junte cenoura, pimentão e ervilha.'] },
    { title: 'Crepioca de queijo branco', time: '8 min', ingredients: ['1 ovo', '2 colheres (sopa) de goma de tapioca', '1 fatia de queijo branco', 'Orégano'], steps: ['Bata o ovo com a tapioca.', 'Despeje na frigideira quente e espalhe.', 'Quando firmar, recheie com queijo e orégano e dobre ao meio.'] },
    { title: 'Picolé caseiro de fruta', time: '10 min + congelador', ingredients: ['2 xícaras de frutas (manga, morango ou abacaxi)', '1/2 xícara de água ou água de coco', 'Hortelã (opcional)'], steps: ['Bata as frutas com a água no liquidificador.', 'Distribua em forminhas de picolé.', 'Congele por pelo menos 6 horas.'] }
  ],
  mealPlans: [
    ['Crepioca de queijo branco e fruta', 'Arroz integral colorido, frango e salada verde', 'Iogurte com frutas e sementes', 'Sopa de lentilha e abóbora'],
    ['Panqueca de banana e aveia', 'Peixe assado com batata e brócolis', 'Maçã e castanhas', 'Wrap integral de frango'],
    ['Pão integral com ovo mexido e mamão', 'Escondidinho de mandioca com salada', 'Iogurte natural com aveia', 'Omelete de forno com legumes'],
    ['Iogurte, aveia e morangos', 'Salada de grão-de-bico com arroz e frango', 'Banana com canela', 'Frango desfiado com legumes e mandioca'],
    ['Tapioca com queijo branco e tomate', 'Arroz, feijão, carne magra e legumes', 'Fruta da estação e castanhas', 'Sopa de legumes com frango'],
    ['Aveia com leite ou bebida vegetal e banana', 'Macarrão integral com frango e brócolis', 'Picolé caseiro de fruta', 'Arroz integral colorido com ovo'],
    ['Omelete com espinafre e pão integral', 'Arroz, lentilha, peixe e salada', 'Iogurte com frutas e sementes', 'Wrap integral de frango com salada']
  ],
  workoutPlan: {
    title: 'Plano progressivo de 4 semanas (3 treinos por semana)',
    note: 'Faça os treinos em dias alternados. Ajuste cargas e repetições ao seu nível, priorize a técnica e interrompa se sentir dor. Se tiver alguma condição de saúde, consulte um profissional antes.',
    weeks: [
      { week: 'Semana 1 — Adaptação', focus: '2 séries de 10–12 repetições, descanso de 90 s.', sessions: ['A: agachamento, flexão inclinada, remada com elástico, prancha 20 s', 'B: ponte de glúteos, desenvolvimento com halteres leves, afundo assistido, dead bug', 'C: caminhada rápida 25 min + alongamento'] },
      { week: 'Semana 2 — Consistência', focus: '3 séries de 10–12 repetições, descanso de 75–90 s.', sessions: ['A: agachamento, flexão inclinada, remada, prancha 30 s', 'B: ponte de glúteos, desenvolvimento, afundo, dead bug', 'C: caminhada ou bicicleta 30 min'] },
      { week: 'Semana 3 — Progressão', focus: '3 séries de 8–12 repetições com um pouco mais de carga, descanso de 75 s.', sessions: ['A: agachamento com halter, flexão, remada unilateral, prancha 40 s', 'B: stiff com halteres, desenvolvimento, afundo alternado, prancha lateral', 'C: intervalado leve: 1 min rápido / 2 min moderado por 24 min'] },
      { week: 'Semana 4 — Consolidação', focus: '3–4 séries de 8–12 repetições, descanso de 60–75 s.', sessions: ['A: agachamento, flexão, remada, prancha 45 s + 10 min de caminhada', 'B: stiff, desenvolvimento, afundo, prancha lateral + 10 min de bicicleta', 'C: caminhada ou corrida leve 35 min + mobilidade'] }
    ]
  },
  bonusChallenges: [
    { title: 'Semana sem refrigerante', description: 'Troque refrigerantes e sucos adoçados por água, água com gás e limão ou chás sem açúcar durante 7 dias.' },
    { title: '10 mil passos', description: 'Some caminhadas ao longo do dia para chegar perto de 10 mil passos em pelo menos 5 dias da semana. Comece de onde você está e aumente aos poucos.' },
    { title: 'Prato colorido todo dia', description: 'Inclua vegetais de pelo menos 3 cores diferentes no almoço ou no jantar durante 7 dias.' },
    { title: 'Sono em dia', description: 'Defina um horário fixo para dormir e evite telas 30 minutos antes, por 7 noites seguidas.' }
  ]
};
