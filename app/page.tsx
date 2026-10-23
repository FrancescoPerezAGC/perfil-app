"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Dica = { ordem: number; texto: string };
type Perfil = {
  id: string;
  categoria: string;
  resposta: string;
  respostas_aceitas: string[];
  dicas: Dica[];
};
type Rev = { proxima_revisao: string; intervalo_dias: number };
type Revisoes = Record<string, Rev>;
type Tipo = "revisao" | "novo" | "extra";
type Filtro = "todas" | "pessoa" | "lugar" | "coisa" | "ano";

const FILTROS: { valor: Filtro; nome: string }[] = [
  { valor: "todas", nome: "Todas" },
  { valor: "pessoa", nome: "Pessoas" },
  { valor: "lugar", nome: "Lugares" },
  { valor: "coisa", nome: "Coisas" },
  { valor: "ano", nome: "Anos" },
];

// quantos perfis recém-jogados ficam de fora do sorteio
const MEMORIA = 30;

// ignora acentos, maiúsculas e espaços nas pontas
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// datas no formato AAAA-MM-DD, no fuso do aparelho
const hoje = () => new Date().toLocaleDateString("sv-SE");
const somarDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("sv-SE");
};

function escolher(lista: Perfil[], revs: Revisoes, recentes: string[]) {
  // tira os jogados há pouco; se sobrar pouca coisa, relaxa a regra
  let base = lista.filter((p) => !recentes.includes(p.id));
  if (base.length === 0) {
    const ultimo = recentes[recentes.length - 1];
    base = lista.length > 1 ? lista.filter((p) => p.id !== ultimo) : lista;
  }
  const h = hoje();
  const vencidos = base.filter((p) => revs[p.id] && revs[p.id].proxima_revisao <= h);
  const novos = base.filter((p) => !revs[p.id]);
  const sorteia = (a: Perfil[]) => a[Math.floor(Math.random() * a.length)];

  if (vencidos.length && novos.length) {
    return Math.random() < 0.5
      ? { perfil: sorteia(vencidos), tipo: "revisao" as Tipo }
      : { perfil: sorteia(novos), tipo: "novo" as Tipo };
  }
  if (vencidos.length) return { perfil: sorteia(vencidos), tipo: "revisao" as Tipo };
  if (novos.length) return { perfil: sorteia(novos), tipo: "novo" as Tipo };

  const ordenados = [...base].sort((a, b) =>
    revs[a.id].proxima_revisao.localeCompare(revs[b.id].proxima_revisao)
  );
  return { perfil: ordenados[0], tipo: "extra" as Tipo };
}

const rotulo: Record<Tipo, string> = {
  revisao: "🔁 Revisão",
  novo: "✨ Novo",
  extra: "💪 Treino extra",
};

export default function Home() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [revisoes, setRevisoes] = useState<Revisoes>({});
  const [recentes, setRecentes] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [atual, setAtual] = useState<Perfil | null>(null);
  const [tipo, setTipo] = useState<Tipo>("novo");
  const [usadas, setUsadas] = useState(1);
  const [palpite, setPalpite] = useState("");
  const [estado, setEstado] = useState<"jogando" | "acertou" | "desistiu">("jogando");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [total, setTotal] = useState(0);
  const [vazio, setVazio] = useState(false);

  function sortear(lista: Perfil[], revs: Revisoes, rec: string[]) {
    if (!lista.length) {
      setVazio(true);
      return;
    }
    setVazio(false);
    const { perfil, tipo } = escolher(lista, revs, rec);
    setAtual({ ...perfil, dicas: [...perfil.dicas].sort((a, b) => a.ordem - b.ordem) });
    setTipo(tipo);
    setUsadas(1);
    setPalpite("");
    setEstado("jogando");
    setAviso("");
  }

  const doFiltro = (f: Filtro, todos: Perfil[] = perfis) =>
    f === "todas" ? todos : todos.filter((p) => p.categoria === f);

  useEffect(() => {
    let salvo: Filtro = "todas";
    try {
      const s = localStorage.getItem("perfil-filtro") as Filtro | null;
      if (s && FILTROS.some((x) => x.valor === s)) salvo = s;
    } catch {}

    (async () => {
      const [p, r] = await Promise.all([
        supabase
          .from("perfis")
          .select("id, categoria, resposta, respostas_aceitas, dicas(ordem, texto)")
          .eq("ativo", true),
        supabase.from("revisao").select("perfil_id, proxima_revisao, intervalo_dias"),
      ]);
      if (p.error) return setErro(p.error.message);
      if (r.error) return setErro(r.error.message);

      const lista = (p.data ?? []) as Perfil[];
      const mapa: Revisoes = {};
      (r.data ?? []).forEach((x) => {
        mapa[x.perfil_id] = {
          proxima_revisao: x.proxima_revisao,
          intervalo_dias: x.intervalo_dias,
        };
      });
      setPerfis(lista);
      setRevisoes(mapa);
      setFiltro(salvo);
      sortear(doFiltro(salvo, lista), mapa, []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trocarFiltro(f: Filtro) {
    setFiltro(f);
    try {
      localStorage.setItem("perfil-filtro", f);
    } catch {}
    sortear(doFiltro(f), revisoes, recentes);
  }

  async function finalizar(acertou: boolean) {
    if (!atual) return;
    const pontos = acertou ? 21 - usadas : 0;

    const anterior = revisoes[atual.id];
    const intervaloAnt = anterior?.intervalo_dias ?? 1;
    let intervalo: number;
    let proxima: string;
    if (!acertou) {
      // errou ou desistiu: volta amanhã (não logo em seguida)
      intervalo = 1;
      proxima = somarDias(1);
    } else if (usadas <= 5) {
      intervalo = Math.min(anterior ? intervaloAnt * 2 : 2, 60);
      proxima = somarDias(intervalo);
    } else {
      intervalo = intervaloAnt;
      proxima = somarDias(intervalo);
    }

    setEstado(acertou ? "acertou" : "desistiu");
    setTotal((t) => t + pontos);
    setRecentes((r) => [...r, atual.id].slice(-MEMORIA));
    setRevisoes((r) => ({
      ...r,
      [atual.id]: { proxima_revisao: proxima, intervalo_dias: intervalo },
    }));

    await supabase.from("tentativas").insert({
      perfil_id: atual.id,
      dicas_usadas: usadas,
      acertou,
      pontos,
    });
    await supabase.from("revisao").upsert({
      perfil_id: atual.id,
      proxima_revisao: proxima,
      intervalo_dias: intervalo,
    });
  }

  function chutar(e: React.FormEvent) {
    e.preventDefault();
    if (!atual || !palpite.trim()) return;
    const aceitas = [atual.resposta, ...(atual.respostas_aceitas ?? [])].map(norm);
    if (aceitas.includes(norm(palpite))) {
      finalizar(true);
    } else {
      setAviso("Não é isso. Tente de novo ou peça outra dica.");
      setPalpite("");
    }
  }

  if (erro) return <pre style={{ padding: 24 }}>Erro: {erro}</pre>;
  if (!atual && !vazio) return <p style={{ padding: 24 }}>Carregando...</p>;

  const h = hoje();
  const paraRevisar = perfis.filter(
    (p) => revisoes[p.id] && revisoes[p.id].proxima_revisao <= h
  ).length;

  const barra = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {FILTROS.map((f) => (
        <button
          key={f.valor}
          onClick={() => trocarFiltro(f.valor)}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            borderRadius: 999,
            border: "1px solid #999",
            background: filtro === f.valor ? "#111" : "#fff",
            color: filtro === f.valor ? "#fff" : "#111",
          }}
        >
          {f.nome}
        </button>
      ))}
    </div>
  );

  if (!atual) {
    return (
      <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
        {barra}
        <p>Nenhum perfil nessa categoria.</p>
      </main>
    );
  }

  const fim = estado !== "jogando";
  const temMais = usadas < atual.dicas.length;
  const rev = revisoes[atual.id];

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      {barra}
      <p style={{ textAlign: "right", margin: 0 }}>
        Pontos na sessão: <b>{total}</b>
      </p>
      <p style={{ textAlign: "right", margin: 0, fontSize: 14, color: "#555" }}>
        Para revisar hoje: {paraRevisar}
      </p>

      <p style={{ marginBottom: 0 }}>{rotulo[tipo]}</p>
      <h1 style={{ textTransform: "capitalize", marginTop: 4 }}>{atual.categoria}</h1>
      <p>
        Dica {usadas} de {atual.dicas.length} · vale {21 - usadas} pontos
      </p>

      <ol style={{ paddingLeft: 20, lineHeight: 1.5 }}>
        {atual.dicas.slice(0, usadas).map((d) => (
          <li key={d.ordem} style={{ marginBottom: 8 }}>
            {d.texto}
          </li>
        ))}
      </ol>

      {!fim && (
        <>
          <form onSubmit={chutar} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              value={palpite}
              onChange={(e) => setPalpite(e.target.value)}
              placeholder="Seu palpite"
              style={{ flex: 1, padding: 12, fontSize: 16 }}
            />
            <button type="submit" style={{ padding: "12px 16px", fontSize: 16 }}>
              Chutar
            </button>
          </form>
          {aviso && <p style={{ color: "#b45309" }}>{aviso}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => {
                setUsadas(usadas + 1);
                setAviso("");
              }}
              disabled={!temMais}
              style={{ flex: 1, padding: 12, fontSize: 16 }}
            >
              Próxima dica
            </button>
            <button onClick={() => finalizar(false)} style={{ padding: 12, fontSize: 16 }}>
              Desistir
            </button>
          </div>
        </>
      )}

      {fim && (
        <div style={{ marginTop: 16 }}>
          <h2>{estado === "acertou" ? `Acertou! +${21 - usadas} pontos` : "Resposta:"}</h2>
          <p style={{ fontSize: 22 }}>
            <b>{atual.resposta}</b>
          </p>
          {rev && (
            <p style={{ color: "#555" }}>
              {rev.proxima_revisao <= h
                ? "Esse perfil volta ainda hoje."
                : `Esse perfil volta em ${rev.intervalo_dias} ${
                    rev.intervalo_dias === 1 ? "dia" : "dias"
                  }.`}
            </p>
          )}
          <button
            onClick={() => sortear(doFiltro(filtro), revisoes, recentes)}
            style={{ width: "100%", padding: 14, fontSize: 16 }}
          >
            Próximo perfil
          </button>
        </div>
      )}
    </main>
  );
}
