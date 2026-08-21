import { useEffect, useState } from 'react';
import Tag from '../../components/Tag';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import BottomTab from '../../components/BottomTab';
import OrientacaoCard from './OrientacaoCard';
import { getOrientacoes, getCategoriasOrientacoes, getPatient } from '../../services/mockApi';
import styles from './OrientacoesBiblioteca.module.css';

const STATUS_FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'favoritas', label: 'Favoritas' },
  { key: 'nao-lidas', label: 'Não lidas' },
];

export default function OrientacoesBiblioteca() {
  const [carregando, setCarregando] = useState(true);
  const [orientacoes, setOrientacoes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [diagnostico, setDiagnostico] = useState(null);

  const [statusFiltro, setStatusFiltro] = useState('todas');
  const [categoriaFiltro, setCategoriaFiltro] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregarInicial() {
      setCarregando(true);
      const [orientacoesData, categoriasData, patientData] = await Promise.all([
        getOrientacoes(),
        getCategoriasOrientacoes(),
        getPatient(),
      ]);

      if (!ativo) return;
      setOrientacoes(orientacoesData);
      setCategorias(categoriasData);
      setDiagnostico(patientData.diagnostico || null);
      setCarregando(false);
    }

    carregarInicial();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (carregando) return;

    let ativo = true;

    getOrientacoes({
      categoria: categoriaFiltro || undefined,
      favoritas: statusFiltro === 'favoritas' || undefined,
      naoLidas: statusFiltro === 'nao-lidas' || undefined,
    }).then((data) => {
      if (ativo) setOrientacoes(data);
    });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFiltro, categoriaFiltro]);

  if (carregando) {
    return <Loading />;
  }

  const grupos = [];
  const gruposPorCategoria = new Map();
  orientacoes.forEach((orientacao) => {
    if (!gruposPorCategoria.has(orientacao.categoria)) {
      const grupo = { categoria: orientacao.categoria, itens: [] };
      gruposPorCategoria.set(orientacao.categoria, grupo);
      grupos.push(grupo);
    }
    gruposPorCategoria.get(orientacao.categoria).itens.push(orientacao);
  });

  function handleFavoritoChange(id, novoFavorito) {
    setOrientacoes((atual) =>
      atual.map((item) => (item.id === id ? { ...item, favorito: novoFavorito } : item))
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ORIENTAÇÕES</p>
        <h1 className={styles.title}>Biblioteca</h1>

        {diagnostico && (
          <div className={styles.diagnosticoBanner}>
            <p className={styles.diagnosticoLabel}>FILTRADO PELO SEU DIAGNÓSTICO</p>
            <p className={styles.diagnosticoValue}>
              <span className={styles.diagnosticoCid}>{diagnostico.cid}</span> ·{' '}
              {diagnostico.descricao}
            </p>
          </div>
        )}

        <div className={styles.filters}>
          <div className={styles.filterRow}>
            {STATUS_FILTROS.map((item) => (
              <Tag
                key={item.key}
                selected={statusFiltro === item.key}
                onClick={() => setStatusFiltro(item.key)}
              >
                {item.label}
              </Tag>
            ))}
          </div>

          <div className={styles.filterRow}>
            <Tag selected={categoriaFiltro === null} onClick={() => setCategoriaFiltro(null)}>
              Todas
            </Tag>
            {categorias.map((categoria) => (
              <Tag
                key={categoria}
                selected={categoriaFiltro === categoria}
                onClick={() => setCategoriaFiltro(categoria)}
              >
                {categoria}
              </Tag>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.list}>
        {orientacoes.length === 0 ? (
          <EmptyState
            title="Nenhuma orientação encontrada"
            description="Tente ajustar os filtros para ver outros conteúdos."
          />
        ) : (
          grupos.map((grupo, index) => (
            <section key={grupo.categoria}>
              <h3 className={index === 0 ? styles.groupTitleFirst : styles.groupTitle}>
                {grupo.categoria.toUpperCase()} · {grupo.itens.length}
              </h3>
              <div className={styles.groupEntries}>
                {grupo.itens.map((orientacao) => (
                  <OrientacaoCard
                    orientacao={orientacao}
                    key={orientacao.id}
                    onFavoritoChange={handleFavoritoChange}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <BottomTab />
    </div>
  );
}
