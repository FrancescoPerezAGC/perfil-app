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

// ignora acentos, maiúsculas e espaços nas pontas
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// datas no formato AAAA-MM-DD, no fuso do aparelho
const hoje = () => new Date().toLocaleDateString("sv-SE");
const somarDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("sv-SE");
};

function escolher(lista: Perfil[], revs: Revisoes, evitarId?: string) {
  const base = lista.length > 1 ? lista.filter((p) => p.id !== evitarId) : lista;
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
  const [atual, setAtual] = useState<Perfil | null>(null);
  const [tipo, setTipo] = useState<Tipo>("novo");
  const [usadas, setUsadas] = useState(1);
  const [palpite, setPalpite] = useState("");
  const [estado, setEstado] = useState<"jogando" | "acertou" | "desistiu">("jogando");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [total, setTotal] = useState(0);

  function sortear(lista: Perfil[], revs: Revisoes, evitarId?: string) {
    const { perfil, tipo } = escolher(lista, revs, evitarId);
    setAtual({ ...perfil, dicas: [...perfil.dicas].sort((a, b) => a.ordem - b.ordem) });
    setTipo(tipo);
    setUsadas(1);
    setPalpite("");
    setEstado("jogando");
    setAviso("");
  }

  useEffect(() => {
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
      if (lista.length) sortear(lista, mapa);
    })();
  }, []);

  async function finalizar(acertou: boolean) {
    if (!atual) return;
    const pontos = acertou ? 21 - usadas : 0;

    const anterior = revisoes[atual.id];
    const intervaloAnt = anterior?.intervalo_dias ?? 1;
    let intervalo: number;
    let proxima: string;
    if (!acertou) {
      intervalo = 1;
      proxima = hoje();
    } else if (usadas <= 5) {
      intervalo = Math.min(anterior ? intervaloAnt * 2 : 2, 60);
      proxima = somarDias(intervalo);
    } else {
      intervalo = intervaloAnt;
      proxima = somarDias(intervalo);
    }

    setEstado(acertou ? "acertou" : "desistiu");
    setTotal((t) => t + pontos);
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
  if (!atual) return <p style={{ padding: 24 }}>Carregando...</p>;

  const fim = estado !== "jogando";
  const temMais = usadas < atual.dicas.length;
  const h = hoje();
  const paraRevisar = perfis.filter(
    (p) => revisoes[p.id] && revisoes[p.id].proxima_revisao <= h
  ).length;
  const rev = revisoes[atual.id];

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <p style={{ textAlign: "right", margin: 0 }}>
        Pontos na sessão: <b>{total}</b>
      </p>
      <p style={{ textAlign: "right", margin: 0, fontSize: 14, color: "#555" }}>
        Para revisar hoje: {paraRevisar}
      </p>

      <p style={{ marginBottom: 0 }}>{rotulo[tipo]}</p>
      <h1 style={{ textTransform: "capitalize", marginTop: 4 }}>{atual.categoria}</h1>
      <p>
        Dica {usadas} de {atual.dicas.length}
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
            onClick={() => sortear(perfis, revisoes, atual.id)}
            style={{ width: "100%", padding: 14, fontSize: 16 }}
          >
            Próximo perfil
          </button>
        </div>
      )}
    </main>
  );
}