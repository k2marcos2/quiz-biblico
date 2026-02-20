const API_URL = "https://script.google.com/macros/s/AKfycbxHnQDkOqAQGWulnQZTfA620m-dGvOwR9SEDAjFRo2sEMM72kVYk6e-b0kuNcPBYI0a/exec";

const LS = {
  nome: "quiz_nome",
  userId: "quiz_userId",
  eventId: "quiz_eventId",
  startedAt: "quiz_startedAt",
  answers: "quiz_answers",
};

function getUserId() {
  let id = localStorage.getItem(LS.userId);
  if (!id) {
    id = "U" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    localStorage.setItem(LS.userId, id);
  }
  return id;
}
function getNome() { return (localStorage.getItem(LS.nome) || "").trim(); }
function setNome(n) { localStorage.setItem(LS.nome, (n || "").trim()); }

async function api(params) {
  const url = API_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  return await res.json();
}

function fmtMs(ms) {
  ms = Math.max(0, Number(ms || 0));
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---------------- INDEX ----------------
async function initIndex() {
  const nomeInput = document.getElementById("nome");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnEntrar = document.getElementById("btnEntrar");
  const btnRanking = document.getElementById("btnRanking");
  const statusBox = document.getElementById("statusBox");
  if (!nomeInput || !btnSalvar || !btnEntrar || !btnRanking || !statusBox) return;

  nomeInput.value = getNome();
  btnSalvar.onclick = () => { setNome(nomeInput.value); alert("Nome salvo!"); };

  async function refresh() {
    try {
      const data = await api({ action: "status" });
      if (!data.ok || !data.hasEvent) {
        statusBox.textContent = "Sem evento/erro: " + (data.error || "desconhecido");
        btnEntrar.disabled = true;
        btnRanking.disabled = true;
        return;
      }

      const ev = data.event;
      localStorage.setItem(LS.eventId, ev.eventId); // só pra ranking

      const now = Date.now();
      const start = new Date(ev.inicioISO).getTime();
      const end = new Date(ev.fimISO).getTime();

      let txt = `🎯 ${ev.titulo}\n\n`;
      if (ev.state === "scheduled") {
        txt += `⏳ Começa em: ${fmtMs(start - now)}\nInício: ${ev.inicioISO}\nFim: ${ev.fimISO}`;
      } else if (ev.state === "live") {
        txt += `🟢 AO VIVO AGORA\n⏱️ Encerra em: ${fmtMs(end - now)}\nFim: ${ev.fimISO}`;
      } else {
        const nextStart = end;
        txt += `🔴 BLOCO ENCERRADO\n⏳ Próximo em: ${fmtMs(nextStart - now)}\nPróximo início: ${new Date(nextStart).toISOString()}`;
      }
      statusBox.textContent = txt;

      btnRanking.disabled = false;
      btnEntrar.disabled = !(getNome() && ev.state === "live");

      btnEntrar.onclick = async () => {
        const nomeNow = getNome();
        if (!nomeNow) return alert("Salve seu nome primeiro.");

        const started = await api({
          action: "start",
          userId: getUserId(),
          nome: nomeNow,
        });

        if (!started.ok) return alert(started.error || "Não foi possível iniciar.");

        localStorage.setItem(LS.eventId, started.eventId); // trava bloco
        localStorage.setItem(LS.startedAt, String(Date.now()));
        localStorage.setItem(LS.answers, JSON.stringify([]));

        window.location.href = "quiz.html";
      };

      btnRanking.onclick = () => window.location.href = "ranking.html";
    } catch (e) {
      statusBox.textContent = "Erro ao conectar na API.";
      btnEntrar.disabled = true;
      btnRanking.disabled = true;
    }
  }

  await refresh();
  setInterval(refresh, 500);
}

// ---------------- QUIZ ----------------
async function initQuiz() {
  const qBox = document.getElementById("qBox");
  if (!qBox) return;

  const title = document.getElementById("title");
  const timerEl = document.getElementById("timer");
  const countEl = document.getElementById("count");
  const msgEl = document.getElementById("msg");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnFinish = document.getElementById("btnFinish");

  const nome = getNome();
  const lockedEventId = localStorage.getItem(LS.eventId);
  if (!nome || !lockedEventId) {
    alert("Sem nome/evento. Volte ao início.");
    window.location.href = "index.html";
    return;
  }

  const st = await api({ action: "status" });
  if (!st.ok || !st.hasEvent) {
    alert("Erro ao pegar status.");
    window.location.href = "index.html";
    return;
  }

  const current = st.event;
  title.textContent = current.titulo;

  if (current.eventId !== lockedEventId) {
    alert("O bloco virou. Volte ao início e entre de novo.");
    window.location.href = "index.html";
    return;
  }
  if (current.state !== "live") {
    alert("Bloco não está AO VIVO. Volte ao início.");
    window.location.href = "index.html";
    return;
  }

  const qRes = await api({ action: "questions" });
  if (!qRes.ok) {
    alert(qRes.error || "Não deu pra carregar perguntas.");
    window.location.href = "index.html";
    return;
  }

  const questions = qRes.questions || [];
  if (!questions.length) {
    alert("Sem perguntas na aba PERGUNTAS.");
    window.location.href = "index.html";
    return;
  }

  let answers = JSON.parse(localStorage.getItem(LS.answers) || "[]");
  while (answers.length < questions.length) answers.push(undefined);

  let idx = 0;
  const startedAt = Number(localStorage.getItem(LS.startedAt) || Date.now());
  const blockEndMs = new Date(current.fimISO).getTime();

  function render() {
    const q = questions[idx];
    countEl.textContent = `${idx + 1}/${questions.length}`;

    const chosen = answers[idx];
    qBox.innerHTML = `
      <div><b>${q.pergunta}</b></div>
      <div class="small">Referência: ${q.versiculo || "-"}</div>
      <div style="margin-top:8px;">
        ${q.options.map((opt, i) => `
          <label class="opt">
            <input type="radio" name="opt" value="${i}" ${chosen === i ? "checked" : ""} />
            ${opt}
          </label>
        `).join("")}
      </div>
    `;

    btnPrev.disabled = idx === 0;
    btnNext.disabled = (answers[idx] === undefined) || idx === questions.length - 1;
    btnFinish.disabled = answers.some(a => a === undefined);
  }

  qBox.addEventListener("change", (ev) => {
    const v = Number(ev.target.value);
    answers[idx] = v;
    localStorage.setItem(LS.answers, JSON.stringify(answers));
    render();
  });

  btnPrev.onclick = () => { idx = Math.max(0, idx - 1); render(); };
  btnNext.onclick = () => { idx = Math.min(questions.length - 1, idx + 1); render(); };

  const tick = setInterval(() => {
    timerEl.textContent = fmtMs(Date.now() - startedAt);
    if (Date.now() > blockEndMs) {
      clearInterval(tick);
      alert("O bloco encerrou. Volte ao início para o próximo.");
      window.location.href = "index.html";
    }
  }, 250);

  btnFinish.onclick = async () => {
    const tempoMs = Date.now() - startedAt;
    msgEl.textContent = "Enviando resultado...";

    const res = await api({
      action: "submit",
      eventId: lockedEventId,
      userId: getUserId(),
      nome,
      answers: JSON.stringify(answers),
      tempoMs: String(tempoMs)
    });

    if (!res.ok) {
      msgEl.textContent = "Erro: " + (res.error || "desconhecido");
      return;
    }

    alert(`Resultado enviado!\nScore: ${res.score}\nAcertos: ${res.acertos}\nTempo: ${fmtMs(res.tempoMs)}\nBônus: ${res.bonus}`);
    window.location.href = "ranking.html";
  };

  render();
}

// ---------------- RANKING ----------------
async function initRanking() {
  const list = document.getElementById("list");
  const title = document.getElementById("title");
  if (!list || !title) return;

  const st = await api({ action: "status" });
  if (!st.ok || !st.hasEvent) {
    list.textContent = "Erro ao pegar status.";
    return;
  }

  const ev = st.event;
  title.textContent = `Ranking — ${ev.titulo} (${ev.eventId})`;

  const r = await api({ action: "ranking", eventId: ev.eventId, limit: 50 });
  if (!r.ok) {
    list.textContent = "Erro: " + (r.error || "desconhecido");
    return;
  }

  const rows = r.ranking || [];
  if (!rows.length) {
    list.textContent = "Ainda não tem resultados neste bloco.";
    return;
  }

  list.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Nome</th><th>Score</th><th>Acertos</th><th>Tempo</th></tr></thead>
      <tbody>
        ${rows.map((x, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${x.nome || ""}</td>
            <td>${Number(x.score || 0)}</td>
            <td>${Number(x.acertos || 0)}</td>
            <td>${fmtMs(Number(x.tempoMs || 0))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Boot
(function () {
  const path = location.pathname.toLowerCase();
  if (path.endsWith("index.html") || path.endsWith("/")) initIndex();
  else if (path.endsWith("quiz.html")) initQuiz();
  else if (path.endsWith("ranking.html")) initRanking();
})();