import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, CheckCircle2, AlertCircle, RefreshCw, Search, Truck, PackageCheck } from 'lucide-react';

// ==============================================================================
// CONFIGURAÇÃO SUPABASE
// ==============================================================================
const SUPABASE_URL = "https://hpybihnngroswlmounuj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhweWJpaG5uZ3Jvc3dsbW91bnVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQxMTg5MywiZXhwIjoyMTAwOTg3ODkzfQ.lbXty_beQJYRugfelgyvDzkLoo-dzEK24gsdzvNe5gM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Lista fixa de todas as docas
const ALL_DOCKS = [
  'INT01', 'INT02', 'INT03', 'INT04',
  'EXT.INB01', 'EXT.INB02', 'EXT.INB03', 'EXT.INB04'
];

// Definição de prioridade de exibição dos status
const STATUS_PRIORITY = {
  'Em fila': 1,
  'Sendo docado': 2,
  'Docado': 3,
  'Finalizado': 4
};

export default function App() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastSync, setLastSync] = useState('');

  // Estados para os filtros de Status
  const [selectedStatus, setSelectedStatus] = useState({
    'Em fila': true,
    'Sendo docado': true,
    'Docado': true,
    'Finalizado': true
  });

  // Estados para os filtros de Modalidade
  const [selectedModality, setSelectedModality] = useState({
    'FM': true,
    'LH': true
  });

  const handleStatusToggle = (status) => {
    setSelectedStatus(prev => ({ ...prev, [status]: !prev[status] }));
  };

  const handleModalityToggle = (modality) => {
    setSelectedModality(prev => ({ ...prev, [modality]: !prev[modality] }));
  };

  // Função auxiliar para formatar a data/hora do updated_at
  const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    
    // Se for do mesmo dia, exibe apenas a hora. Caso contrário, exibe data e hora.
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('pt-BR');
    }
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inbound_trips')
        .select('*');

      if (error) throw error;

      const tripsData = data || [];

      // Ordenação das viagens
      const sortedData = tripsData.sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a.status] || 99;
        const priorityB = STATUS_PRIORITY[b.status] || 99;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return (a.origin || '').localeCompare(b.origin || '', undefined, { numeric: true });
      });

      setTrips(sortedData);

      // ==============================================================================
      // ATUALIZAÇÃO DA ÚLTIMA SYNC BASEADO EM UPDATED_AT
      // ==============================================================================
      if (sortedData.length > 0) {
        // Encontra o registro com a maior/mais recente updated_at
        const maxUpdatedAt = sortedData.reduce((max, trip) => {
          if (!trip.updated_at) return max;
          return !max || new Date(trip.updated_at) > new Date(max) ? trip.updated_at : max;
        }, null);

        if (maxUpdatedAt) {
          setLastSync(formatTimestamp(maxUpdatedAt));
        }
      } 
      // Se não houver viagens na busca (tabela zerada no início do dia):
      // mantemos o valor de lastSync já gravado no estado anterior (se existir).
    } catch (err) {
      console.error('Erro ao buscar viagens:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();

    const interval = setInterval(() => {
      fetchTrips();
    }, 3 * 60 * 1000);

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Mapeamento das docas atualmente ocupadas por veículos ativos
  const occupiedDocks = trips.reduce((acc, trip) => {
    if (trip.dock_number && trip.status !== 'Finalizado') {
      acc.add(trip.dock_number.trim());
    }
    return acc;
  }, new Set());

  // ==============================================================================
  // CÁLCULO DO TOTAL RECEBIDO (STATUS = FINALIZADO) FILTRADO POR MODALIDADE
  // ==============================================================================
  const totalReceivedPackages = trips.reduce((acc, trip) => {
    if (trip.status === 'Finalizado') {
      const tripModality = trip.modality || 'LH';
      if (selectedModality[tripModality]) {
        return acc + (Number(trip.total_packages) || 0);
      }
    }
    return acc;
  }, 0);

  // Texto descritivo/badge para indicar quais modalidades estão somadas no Card
  const getReceivedLabel = () => {
    if (selectedModality['FM'] && selectedModality['LH']) return 'FM + LH';
    if (selectedModality['FM']) return 'FM';
    if (selectedModality['LH']) return 'LH';
    return 'NENHUM';
  };

  // ==============================================================================
  // CONTAGENS DINÂMICAS E CRUZADAS DOS FILTROS
  // ==============================================================================
  
  // Contagens de Status levando em consideração as Modalidades marcadas
  const dynamicCountsByStatus = trips.reduce((acc, trip) => {
    const tripModality = trip.modality || 'LH';
    if (selectedModality[tripModality]) {
      const st = trip.status || 'Em fila';
      acc[st] = (acc[st] || 0) + 1;
    }
    return acc;
  }, {});

  // Contagens de Modalidade levando em consideração os Status marcados
  const dynamicCountsByModality = trips.reduce((acc, trip) => {
    const tripStatus = trip.status || 'Em fila';
    if (selectedStatus[tripStatus]) {
      const mod = trip.modality || 'LH';
      acc[mod] = (acc[mod] || 0) + 1;
    }
    return acc;
  }, {});

  // Filtragem final para exibição dos cards
  const filteredTrips = trips.filter((trip) => {
    const search = searchTerm.toLowerCase();
    const tripStatus = trip.status || 'Em fila';
    const tripModality = trip.modality || 'LH';

    if (!selectedStatus[tripStatus]) return false;
    if (!selectedModality[tripModality]) return false;

    return (
      (trip.origin && trip.origin.toLowerCase().includes(search)) ||
      (trip.vehicle_plate && trip.vehicle_plate.toLowerCase().includes(search)) ||
      (trip.driver_name && trip.driver_name.toLowerCase().includes(search)) ||
      (trip.status && trip.status.toLowerCase().includes(search)) ||
      (trip.lt_number && trip.lt_number.toLowerCase().includes(search)) ||
      (trip.dock_number && trip.dock_number.toLowerCase().includes(search))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      
      {/* CABEÇALHO */}
      <header className="bg-white border-b-4 border-orange-500 shadow-sm px-6 py-4 mb-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* TÍTULO E ÍCONE */}
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-2.5 rounded-xl shadow-md">
              <Truck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 leading-tight">
                Painel Inbound - SPX
              </h1>
              <p className="text-xs font-bold text-slate-400">
                Monitoramento de Fila e Descarregamento em Tempo Real
              </p>
            </div>
          </div>

          {/* CARD DE TOTAL RECEBIDO (CENTRO / ESPAÇO MARCADO) */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-4 py-2 rounded-2xl shadow-inner">
            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-sm">
              <PackageCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Total Recebido
                </span>
                <span
                  className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                    getReceivedLabel() === 'FM'
                      ? 'bg-red-100 text-red-700'
                      : getReceivedLabel() === 'LH'
                      ? 'bg-blue-100 text-blue-700'
                      : getReceivedLabel() === 'FM + LH'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {getReceivedLabel()}
                </span>
              </div>
              <div className="text-lg font-black text-slate-800 leading-tight">
                {totalReceivedPackages.toLocaleString('pt-BR')} <span className="text-xs font-bold text-slate-500">pcs</span>
              </div>
            </div>
          </div>

          {/* BUSCA, REFRESH E ÚLTIMA SYNC */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3 w-full md:w-auto h-8">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar Fila, Placa, Motorista, Doca..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>

              <button
                onClick={fetchTrips}
                disabled={loading}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50 h-full"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {lastSync && (
              <span className="text-[10px] font-bold text-slate-400">
                Última sincronização: {lastSync}
              </span>
            )}
          </div>

        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6">
        
        {/* BARRA DE FILTROS DINÂMICOS */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 flex flex-wrap items-center justify-between gap-4">
          
          {/* Filtros de Status */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 uppercase tracking-wider text-xs font-extrabold mr-1">
              Filtros de Status:
            </span>

            {[
              'Em fila',
              'Sendo docado',
              'Docado',
              'Finalizado',
            ].map((status, index, array) => {
              const isActive = selectedStatus[status];
              return (
                <React.Fragment key={status}>
                  <label className="flex items-center gap-2 cursor-pointer select-none hover:opacity-80 transition-opacity">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => handleStatusToggle(status)}
                        className="peer appearance-none w-4 h-4 bg-slate-200 checked:bg-orange-500 rounded cursor-pointer transition-colors focus:outline-none"
                      />
                      <svg
                        className="absolute w-3 h-3 text-white pointer-events-none hidden peer-checked:block"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        viewBox="0 0 24 24"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>

                    <span
                      className={`flex items-center gap-1.5 uppercase text-xs transition-all ${
                        isActive
                          ? 'font-black text-slate-900'
                          : 'font-semibold text-slate-400'
                      }`}
                    >
                      {status}:{' '}
                      <strong
                        className={`text-xs px-1.5 py-0.5 rounded-md transition-all ${
                          isActive
                            ? 'font-black text-slate-900 bg-slate-100'
                            : 'font-semibold text-slate-400 bg-slate-100/60'
                        }`}
                      >
                        {dynamicCountsByStatus[status] || 0}
                      </strong>
                    </span>
                  </label>

                  {index < array.length - 1 && <span className="text-slate-200">|</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Filtros de Modalidade */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 uppercase tracking-wider text-xs font-extrabold mr-1">
              Modalidade:
            </span>

            {/* BOTÃO FM */}
            <button
              type="button"
              onClick={() => handleModalityToggle('FM')}
              className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
                selectedModality['FM']
                  ? 'bg-red-50 border-red-300 text-red-700 shadow-sm font-black'
                  : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'
              }`}
            >
              <span>FM</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-xs ${
                  selectedModality['FM']
                    ? 'bg-red-100 text-red-800 font-black'
                    : 'bg-slate-200/60 text-slate-400 font-normal'
                }`}
              >
                {dynamicCountsByModality['FM'] || 0}
              </span>
            </button>

            {/* BOTÃO LH */}
            <button
              type="button"
              onClick={() => handleModalityToggle('LH')}
              className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
                selectedModality['LH']
                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm font-black'
                  : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'
              }`}
            >
              <span>LH</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-xs ${
                  selectedModality['LH']
                    ? 'bg-blue-100 text-blue-800 font-black'
                    : 'bg-slate-200/60 text-slate-400 font-normal'
                }`}
              >
                {dynamicCountsByModality['LH'] || 0}
              </span>
            </button>
          </div>
        </div>

        {/* INDICADOR DE EXIBIÇÃO + PAINEL DE DOCAS */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 px-1">
          <span className="bg-slate-200/60 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
            Exibindo {filteredTrips.length} de {trips.length} veículos
          </span>

          {/* LISTA DE DOCAS */}
          <div className="flex flex-wrap items-center gap-2 bg-white px-4 py-1.5 rounded-xl shadow-sm border border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">
              Docas:
            </span>

            {ALL_DOCKS.map((dock) => {
              const isOccupied = occupiedDocks.has(dock);
              return (
                <div
                  key={dock}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all border ${
                    isOccupied
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm shadow-emerald-500/10 font-black'
                      : 'bg-slate-100 text-slate-400 border-slate-200 font-normal'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOccupied
                        ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  ></span>
                  <span>{dock}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* GRID DE CARDS */}
        <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.length === 0 && !loading ? (
            <div className="col-span-full text-center py-12 text-slate-400 font-medium">
              Nenhuma viagem encontrada com os filtros selecionados.
            </div>
          ) : (
            filteredTrips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between"
              >
                <div>
                  {/* Posição na Fila e Tempo de Espera */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">
                        POSIÇÃO NA FILA:
                      </span>
                      <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase text-right">
                        TEMPO DE ESPERA:
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-slate-900 leading-none">
                        {trip.origin || '-'}
                      </h2>
                      <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-full text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{trip.waiting_time || '00:00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bloco: PLACA | MOTORISTA | NÚMERO DA LT */}
                  <div className="bg-slate-50 p-3 rounded-xl grid grid-cols-3 gap-2 mb-4 items-start">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        PLACA:
                      </span>
                      <span className="font-medium text-slate-800 text-xs block mt-1 truncate">
                        {trip.vehicle_plate || '-'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        MOTORISTA:
                      </span>
                      <span 
                        className="font-medium text-slate-800 text-xs block mt-1 truncate" 
                        title={trip.driver_name || '-'}
                      >
                        {trip.driver_name || '-'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        NÚMERO DA LT:
                      </span>
                      <span className="font-medium text-slate-800 text-xs block mt-1 truncate">
                        {trip.modality === 'FM' ? '-' : (trip.lt_number || '-')}
                      </span>
                    </div>
                  </div>

                  {/* Modalidade e Volumes */}
                  <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                    <div 
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center min-h-[52px] ${
                        trip.modality === 'FM'
                          ? 'bg-red-50 border-red-100 text-red-700'
                          : 'bg-blue-50 border-blue-100 text-blue-700'
                      }`}
                    >
                      <span 
                        className={`text-[9px] font-bold uppercase block mb-1 ${
                          trip.modality === 'FM' ? 'text-red-400' : 'text-blue-400'
                        }`}
                      >
                        MODALIDADE
                      </span>
                      <span className="font-bold text-sm leading-none">
                        {trip.modality || 'LH'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        SACAS
                      </span>
                      <span className="font-bold text-slate-800 text-sm leading-none">
                        {trip.volume_saca ?? 0}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        SCUTTLES
                      </span>
                      <span className="font-bold text-slate-800 text-sm leading-none">
                        {trip.volume_scuttle ?? 0}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        PALLETS
                      </span>
                      <span className="font-bold text-slate-800 text-sm leading-none">
                        {trip.volume_pallet ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total de Pacotes, Doca e Status */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        TOTAL DE PACOTES:
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {(trip.total_packages || 0).toLocaleString('pt-BR')} pcs
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        DOCA:
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {trip.dock_number || '-'}
                      </span>
                    </div>
                  </div>

                  {/* ESTILOS DE STATUS DIFERENCIADOS */}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase ${
                      trip.status === 'Finalizado'
                        ? 'bg-emerald-100 text-emerald-800'
                        : trip.status === 'Sendo docado'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : trip.status === 'Docado'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {trip.status === 'Finalizado' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {trip.status || 'Em fila'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
