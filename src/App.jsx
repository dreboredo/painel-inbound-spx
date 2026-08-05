import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, CheckCircle2, AlertCircle, RefreshCw, Search, Truck } from 'lucide-react';

// ==============================================================================
// CONFIGURAÇÃO SUPABASE
// ==============================================================================
const SUPABASE_URL = "https://hpybihnngroswlmounuj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhweWJpaG5uZ3Jvc3dsbW91bnVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQxMTg5MywiZXhwIjoyMTAwOTg3ODkzfQ.lbXty_beQJYRugfelgyvDzkLoo-dzEK24gsdzvNe5gM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Definição de prioridade de exibição dos status (Menor número = Aparece primeiro)
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

  // Estados para os filtros de Checkbox (todos marcados por padrão)
  const [selectedStatus, setSelectedStatus] = useState({
    'Em fila': true,
    'Sendo docado': true,
    'Docado': true,
    'Finalizado': true
  });

  // Alterna o estado de um checkbox
  const handleStatusToggle = (status) => {
    setSelectedStatus(prev => ({
      ...prev,
      [status]: !prev[status]
    }));
  };

  // Busca os dados da tabela inbound_trips
  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inbound_trips')
        .select('*');

      if (error) throw error;

      // Ordenação customizada:
      // 1º: Por grupo de Status (Em fila -> Sendo docado -> Docado -> Finalizado)
      // 2º: Por Posição na Fila / Ordem de Chegada
      const sortedData = (data || []).sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a.status] || 99;
        const priorityB = STATUS_PRIORITY[b.status] || 99;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return (a.origin || '').localeCompare(b.origin || '', undefined, { numeric: true });
      });

      setTrips(sortedData);
      setLastSync(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('Erro ao buscar viagens:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();

    // Auto-atualização a cada 3 minutos (180.000 milissegundos)
    const interval = setInterval(() => {
      fetchTrips();
    }, 3 * 60 * 1000);

    // Inscrição Realtime para atualizar a interface instantaneamente
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

  // Contagem geral por status para exibir nos checkboxes
  const countsByStatus = trips.reduce((acc, trip) => {
    const st = trip.status || 'Em fila';
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  // Filtro de busca + Filtro de Checkboxes de Status
  const filteredTrips = trips.filter((trip) => {
    const search = searchTerm.toLowerCase();
    const tripStatus = trip.status || 'Em fila';

    // 1. Verifica se o status está marcado no filtro de checkbox
    if (!selectedStatus[tripStatus]) {
      return false;
    }

    // 2. Aplica o termo de busca textual
    return (
      (trip.origin && trip.origin.toLowerCase().includes(search)) ||
      (trip.vehicle_plate && trip.vehicle_plate.toLowerCase().includes(search)) ||
      (trip.driver_name && trip.driver_name.toLowerCase().includes(search)) ||
      (trip.status && trip.status.toLowerCase().includes(search)) ||
      (trip.lt_number && trip.lt_number.toLowerCase().includes(search))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      
      {/* CABEÇALHO */}
      <header className="bg-white border-b-4 border-orange-500 shadow-sm px-6 py-5 mb-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-2.5 rounded-xl shadow-md">
              <Truck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800">
                Painel Inbound - SPX
              </h1>
              <p className="text-xs font-semibold text-slate-400">
                Monitoramento de Fila e Descarregamento em Tempo Real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar Fila, Placa, Motorista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />
            </div>

            <button
              onClick={fetchTrips}
              disabled={loading}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6">
        
        {/* BARRA DE FILTROS POR CHECKBOX (IGUAL SPX) */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
            <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[11px] mr-1">
              Filtros de Status:
            </span>

            {/* Checkbox: Em fila */}
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-orange-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedStatus['Em fila']}
                onChange={() => handleStatusToggle('Em fila')}
                className="w-4 h-4 rounded cursor-pointer bg-orange-500 accent-orange-500 text-white focus:ring-orange-500 border-none"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                Em fila: <strong className="text-slate-900">{countsByStatus['Em fila'] || 0}</strong>
              </span>
            </label>

            <span className="text-slate-200">|</span>

            {/* Checkbox: Sendo docado */}
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-orange-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedStatus['Sendo docado']}
                onChange={() => handleStatusToggle('Sendo docado')}
                className="w-4 h-4 rounded cursor-pointer bg-orange-500 accent-orange-500 text-white focus:ring-orange-500 border-none"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span>
                Sendo docado: <strong className="text-slate-900">{countsByStatus['Sendo docado'] || 0}</strong>
              </span>
            </label>

            <span className="text-slate-200">|</span>

            {/* Checkbox: Docado */}
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-orange-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedStatus['Docado']}
                onChange={() => handleStatusToggle('Docado')}
                className="w-4 h-4 rounded cursor-pointer bg-orange-500 accent-orange-500 text-white focus:ring-orange-500 border-none"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                Docado: <strong className="text-slate-900">{countsByStatus['Docado'] || 0}</strong>
              </span>
            </label>

            <span className="text-slate-200">|</span>

            {/* Checkbox: Finalizado */}
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-orange-600 transition-colors">
              <input
                type="checkbox"
                checked={selectedStatus['Finalizado']}
                onChange={() => handleStatusToggle('Finalizado')}
                className="w-4 h-4 rounded cursor-pointer bg-orange-500 accent-orange-500 text-white focus:ring-orange-500 border-none"
              />
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                Finalizado: <strong className="text-slate-900">{countsByStatus['Finalizado'] || 0}</strong>
              </span>
            </label>
          </div>

          <div className="text-xs font-bold text-slate-400">
            {lastSync ? `Última sincronização: ${lastSync}` : ''}
          </div>
        </div>

        {/* INDICADOR DE EXIBIÇÃO */}
        <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-4 px-1">
          <span className="bg-slate-200/60 text-slate-600 px-3 py-1 rounded-md">
            Exibindo {filteredTrips.length} de {trips.length} veículos
          </span>
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
                      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase">
                        POSIÇÃO NA FILA:
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase text-right">
                        TEMPO DE ESPERA:
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-black text-slate-900 leading-none">
                        {trip.origin || '-'}
                      </h2>
                      <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-semibold px-3 py-1.5 rounded-full text-xs">
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
                      <span className="font-extrabold text-slate-800 text-xs block mt-1 truncate">
                        {trip.vehicle_plate || '-'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        MOTORISTA:
                      </span>
                      <span 
                        className="font-extrabold text-slate-800 text-xs block mt-1 truncate" 
                        title={trip.driver_name || '-'}
                      >
                        {trip.driver_name || '-'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        NÚMERO DA LT:
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs block mt-1 truncate">
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
                      <span className="font-extrabold text-xs leading-none">
                        {trip.modality || 'LH'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        SACAS
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs leading-none">
                        {trip.volume_saca ?? 0}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        SCUTTLES
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs leading-none">
                        {trip.volume_scuttle ?? 0}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center min-h-[52px]">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                        PALLETS
                      </span>
                      <span className="font-extrabold text-slate-800 text-xs leading-none">
                        {trip.volume_pallet ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total de Pacotes e Status */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      TOTAL DE PACOTES:
                    </span>
                    <span className="text-base font-black text-slate-900">
                      {(trip.total_packages || 0).toLocaleString('pt-BR')} pcs
                    </span>
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
                    <span>{trip.status || 'Em fila'}</span>
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
