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

// ignora acentos, maiúsculas e espaços nas pontas
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function Home() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [atual, setAtual] = useState<Perfil | null>(null);
  const [usadas, setUsadas] = useState(1);
  const [palpite, setPalpite] = useState("");
  const [estado, setEstado] = useState<"jogando" | "acertou" | "desistiu">("jogando");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [total, setTotal] = useState(0);

  function sortear(lista: Perfil[], evitarId?: string) {
    const opcoes = lista.length > 1 ? lista.filter((p) => p.id !== evitarId) : lista;
    const p = opcoes[Math.floor(Math.random() * opcoes.length)];
    setAtual({ ...p, dicas: [...p.dicas].sort((a, b) => a.ordem - b.ordem) });
    setUsadas(1);
    setPalpite("");
    setEstado("jogando");
    setAviso("");
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, categoria, resposta, respostas_aceitas, dicas(ordem, texto)")
        .eq("ativo", true);
      if (error) return setErro(error.message);
      const lista = (data ?? []) as Perfil[];
      setPerfis(lista);
      if (lista.length) sortear(lista);
    })();
  }, []);

  async function finalizar(acertou: boolean) {
    if (!atual) return;
    const pontos = acertou ? 21 - usadas : 0;
    setEstado(acertou ? "acertou" : "desistiu");
    setTotal((t) => t + pontos);
    await supabase.from("tentativas").insert({
      perfil_id: atual.id,
      dicas_usadas: usadas,
      acertou,
      pontos,
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

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <p style={{ textAlign: "right", margin: 0 }}>Pontos na sessão: <b>{total}</b></p>

      <h1 style={{ textTransform: "capitalize" }}>{atual.categoria}</h1>
      <p>Dica {usadas} de {atual.dicas.length}</p>

      <ol style={{ paddingLeft: 20, lineHeight: 1.5 }}>
        {atual.dicas.slice(0, usadas).map((d) => (
          <li key={d.ordem} style={{ marginBottom: 8 }}>{d.texto}</li>
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
            <button type="submit" style={{ padding: "12px 16px", fontSize: 16 }}>Chutar</button>
          </form>
          {aviso && <p style={{ color: "#b45309" }}>{aviso}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={() => { setUsadas(usadas + 1); setAviso(""); }}
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
          <p style={{ fontSize: 22 }}><b>{atual.resposta}</b></p>
          <button
            onClick={() => sortear(perfis, atual.id)}
            style={{ width: "100%", padding: 14, fontSize: 16 }}
          >
            Próximo perfil
          </button>
        </div>
      )}
    </main>
  );
}