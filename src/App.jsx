import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Clock, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, Search, Truck, PackageCheck, TrendingUp, ChevronDown, ChevronRight, Sun, Moon } from 'lucide-react';

// ==============================================================================
// CONFIGURAÇÃO SUPABASE
// ==============================================================================
const SUPABASE_URL = "https://hpybihnngroswlmounuj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhweWJpaG5uZ3Jvc3dsbW91bnVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQxMTg5MywiZXhwIjoyMTAwOTg3ODkzfQ.lbXty_beQJYRugfelgyvDzkLoo-dzEK24gsdzvNe5gM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Lista fixa de todas as docas (internas + separador + externas)
const DOCKS_INTERNAL = ['INT01', 'INT02', 'INT03', 'INT04', 'INT05', 'INT06'];
const DOCKS_EXTERNAL = ['EXT.INB01', 'EXT.INB02', 'EXT.INB03', 'EXT.INB04'];
const ALL_DOCKS = [...DOCKS_INTERNAL, ...DOCKS_EXTERNAL];

// Definição de prioridade de exibição dos status
const STATUS_PRIORITY = {
  'Em fila': 1,
  'Atribuído': 2,
  'Docado': 3,
  'Finalizado': 4
};

// Auxiliar para converter HH:MM ou HH:MM:SS em minutos
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
};

// Auxiliar para converter minutos em HH:MM
const formatMinutesToHHMM = (totalMinutes) => {
  if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Função para calcular o Tempo de Descarga (hora_finalizacao - hora_doca)
const getDischargeTime = (horaDoca, horaFinalizacao) => {
  if (!horaDoca || !horaFinalizacao) return '-';
  const docaTime = new Date(horaDoca).getTime();
  const finalTime = new Date(horaFinalizacao).getTime();
  if (isNaN(docaTime) || isNaN(finalTime) || finalTime < docaTime) return '00:00';
  const dischargeMinutes = Math.floor((finalTime - docaTime) / (1000 * 60));
  return formatMinutesToHHMM(dischargeMinutes);
};

// Função para calcular o nível da permanência ('green', 'yellow', 'orange', 'red')
const getPermanenceStatus = (permanenciaStr, modality) => {
  if (!permanenciaStr) return 'green';
  const minutes = parseTimeToMinutes(permanenciaStr);
  const isFM = modality === 'FM';

  if (isFM) {
    if (minutes < 60) return 'green';       // 00:00:00 até 00:59:59
    if (minutes < 105) return 'yellow';     // 01:00:00 até 01:44:59
    if (minutes < 150) return 'orange';     // 01:45:00 até 02:29:59
    return 'red';                            // 02:30:00 em diante
  } else {
    // LH (Padrão)
    if (minutes < 90) return 'green';       // 00:00:00 até 01:29:59
    if (minutes <= 179) return 'yellow';    // 01:30:00 até 02:59:00
    if (minutes < 240) return 'orange';     // 03:00:00 até 03:59:59
    return 'red';                            // 04:00:00 em diante
  }
};

// Estilos de cor de texto para o campo de Tempo de Permanência
const getPermanenceTextColor = (permanenceStatus, darkMode) => {
  switch (permanenceStatus) {
    case 'yellow':
      return darkMode ? 'text-amber-400' : 'text-amber-500';
    case 'orange':
      return darkMode ? 'text-orange-400' : 'text-orange-500';
    case 'red':
      return darkMode ? 'text-red-400 font-black animate-pulse' : 'text-red-600 font-black';
    case 'green':
    default:
      return darkMode ? 'text-emerald-400' : 'text-emerald-600';
  }
};

export default function App() {
  const [trips, setTrips] = useState([]);
  const [forecastData, setForecastData] = useState({ forecast_lh: 0, forecast_fm: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  
  // Estado para controlar qual linha (viagem) está expandida
  const [expandedTripId, setExpandedTripId] = useState(null);

  // Estados para os filtros de Status
  const [selectedStatus, setSelectedStatus] = useState({
    'Em fila': true,
    'Atribuído': true,
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

  const toggleRowExpand = (id) => {
    setExpandedTripId(prevId => prevId === id ? null : id);
  };

  // Função auxiliar para formatar a data/hora do updated_at
  const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('pt-BR');
    }
    return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Buscando os dados de Forecast da tabela inbound_forecast
  const fetchForecast = async () => {
    try {
      const { data, error } = await supabase
        .from('inbound_forecast')
        .select('forecast_lh, forecast_fm')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar Forecast:', error.message);
        return;
      }

      if (data) {
        setForecastData({
          forecast_lh: Number(data.forecast_lh) || 0,
          forecast_fm: Number(data.forecast_fm) || 0
        });
      }
    } catch (err) {
      console.error('Erro ao processar Forecast:', err.message);
    }
  };

  // Processa atualizações de hora_doca, hora_finalizacao e permanencia
  const processTripTimestamps = async (rawTrips) => {
    const updatedTrips = await Promise.all(
      rawTrips.map(async (trip) => {
        let updates = {};

        // Se tiver ambas as horas gravadas no banco mas ainda não tiver permanência
        if (trip.hora_doca && trip.hora_finalizacao && !trip.permanencia) {
          const docaTime = new Date(trip.hora_doca).getTime();
          const finalTime = new Date(trip.hora_finalizacao).getTime();
          
          const dischargeMinutes = Math.max(0, Math.floor((finalTime - docaTime) / (1000 * 60)));
          const waitMinutes = parseTimeToMinutes(trip.waiting_time);
          const totalPermanenciaMinutes = waitMinutes + dischargeMinutes;

          const permanenciaFormatted = formatMinutesToHHMM(totalPermanenciaMinutes);
          updates.permanencia = permanenciaFormatted;
          trip.permanencia = permanenciaFormatted;
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('inbound_trips')
            .update(updates)
            .eq('id', trip.id);
        }

        return trip;
      })
    );

    return updatedTrips;
  };

  const fetchTrips = async () => {
    try {
      setLoading(true);
      await fetchForecast();

      const { data, error } = await supabase
        .from('inbound_trips')
        .select('*');

      if (error) throw error;

      let tripsData = data || [];

      tripsData = tripsData.map(item => ({
        ...item,
        status: item.status === 'Sendo docado' ? 'Atribuído' : item.status
      }));

      tripsData = await processTripTimestamps(tripsData);

      const sortedData = tripsData.sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a.status] || 99;
        const priorityB = STATUS_PRIORITY[b.status] || 99;

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return (a.origin || '').localeCompare(b.origin || '', undefined, { numeric: true });
      });

      setTrips(sortedData);

      if (sortedData.length > 0) {
        const maxUpdatedAt = sortedData.reduce((max, trip) => {
          if (!trip.updated_at) return max;
          return !max || new Date(trip.updated_at) > new Date(max) ? trip.updated_at : max;
        }, null);

        if (maxUpdatedAt) {
          setLastSync(formatTimestamp(maxUpdatedAt));
        }
      } 
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

    const tripsChannel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_trips' }, () => {
        fetchTrips();
      })
      .subscribe();

    const forecastChannel = supabase
      .channel('schema-forecast-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_forecast' }, () => {
        fetchForecast();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(tripsChannel);
      supabase.removeChannel(forecastChannel);
    };
  }, []);

  const occupiedDocks = trips.reduce((acc, trip) => {
    if (trip.dock_number && trip.status !== 'Finalizado') {
      acc.add(trip.dock_number.trim());
    }
    return acc;
  }, new Set());

  const totalReceivedPackages = trips.reduce((acc, trip) => {
    if (trip.status === 'Finalizado') {
      const tripModality = trip.modality || 'LH';
      if (selectedModality[tripModality]) {
        return acc + (Number(trip.total_packages) || 0);
      }
    }
    return acc;
  }, 0);

  const calculateTotalForecast = () => {
    let total = 0;
    if (selectedModality['FM']) total += forecastData.forecast_fm;
    if (selectedModality['LH']) total += forecastData.forecast_lh;
    return total;
  };

  const totalForecastPackages = calculateTotalForecast();

  const getModalityLabel = () => {
    if (selectedModality['FM'] && selectedModality['LH']) return 'FM + LH';
    if (selectedModality['FM']) return 'FM';
    if (selectedModality['LH']) return 'LH';
    return 'NENHUM';
  };

  const dynamicCountsByStatus = trips.reduce((acc, trip) => {
    const tripModality = trip.modality || 'LH';
    if (selectedModality[tripModality]) {
      const st = trip.status || 'Em fila';
      acc[st] = (acc[st] || 0) + 1;
    }
    return acc;
  }, {});

  const dynamicCountsByModality = trips.reduce((acc, trip) => {
    const tripStatus = trip.status || 'Em fila';
    if (selectedStatus[tripStatus]) {
      const mod = trip.modality || 'LH';
      acc[mod] = (acc[mod] || 0) + 1;
    }
    return acc;
  }, {});

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
    <div className={`min-h-screen font-sans pb-12 transition-colors duration-200 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* CABEÇALHO */}
      <header className={`border-b-4 border-orange-500 shadow-sm px-6 py-4 mb-6 transition-colors duration-200 ${darkMode ? 'bg-slate-900 border-orange-500' : 'bg-white'}`}>
        <div className="w-[80%] mx-auto flex flex-col xl:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-orange-500 text-white p-2.5 rounded-xl shadow-md shrink-0">
              <Truck size={24} />
            </div>
            <div>
              <h1 className={`text-2xl font-black tracking-tight leading-none ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Painel Inbound - SPX
              </h1>
              <p className={`text-xs font-bold mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                Monitoramento de Fila e Descarregamento em Tempo Real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            
            <div className={`flex items-center gap-3 border px-4 py-2 rounded-2xl shadow-inner ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200/80'}`}>
              <div className="bg-orange-500 text-white p-2 rounded-xl shadow-sm shrink-0">
                <TrendingUp size={20} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Total Forecast
                  </span>
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                      getModalityLabel() === 'FM'
                        ? 'bg-red-100 text-red-700'
                        : getModalityLabel() === 'LH'
                        ? 'bg-blue-100 text-blue-700'
                        : getModalityLabel() === 'FM + LH'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {getModalityLabel()}
                  </span>
                </div>
                <div className={`text-lg font-black leading-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {totalForecastPackages.toLocaleString('pt-BR')} <span className="text-xs font-bold text-slate-500">pcs</span>
                </div>
              </div>
            </div>

            <div className={`flex items-center gap-3 border px-4 py-2 rounded-2xl shadow-inner ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200/80'}`}>
              <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-sm shrink-0">
                <PackageCheck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Total Recebido
                  </span>
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                      getModalityLabel() === 'FM'
                        ? 'bg-red-100 text-red-700'
                        : getModalityLabel() === 'LH'
                        ? 'bg-blue-100 text-blue-700'
                        : getModalityLabel() === 'FM + LH'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {getModalityLabel()}
                  </span>
                </div>
                <div className={`text-lg font-black leading-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {totalReceivedPackages.toLocaleString('pt-BR')} <span className="text-xs font-bold text-slate-500">pcs</span>
                </div>
              </div>
            </div>

          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer h-10 shrink-0 ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
              title="Alternar Tema Claro / Escuro"
            >
              {darkMode ? (
                <>
                  <Sun size={14} className="text-amber-400" />
                  <span>Claro</span>
                </>
              ) : (
                <>
                  <Moon size={14} className="text-slate-600" />
                  <span>Escuro</span>
                </>
              )}
            </button>

            <div className="relative w-48 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar fila, Placa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-8 pr-3 h-10 border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            <div className="relative flex flex-col items-center shrink-0">
              <button
                onClick={fetchTrips}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 h-10 rounded-xl text-xs font-black shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>

              {lastSync && (
                <span className="absolute top-full left-0 right-0 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap pt-1">
                  Última sync: {lastSync}
                </span>
              )}
            </div>

          </div>

        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="w-[80%] mx-auto px-2">
        
        {/* BARRA DE FILTROS */}
        <div className={`p-4 rounded-2xl shadow-sm border mb-6 flex flex-wrap items-center justify-between gap-4 transition-colors duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 uppercase tracking-wider text-xs font-extrabold mr-1">
              Filtros de Status:
            </span>

            {[
              'Em fila',
              'Atribuído',
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
                        className={`peer appearance-none w-4 h-4 rounded cursor-pointer transition-colors focus:outline-none ${darkMode ? 'bg-slate-800 checked:bg-orange-500' : 'bg-slate-200 checked:bg-orange-500'}`}
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
                          ? darkMode ? 'font-black text-white' : 'font-black text-slate-900'
                          : 'font-semibold text-slate-400'
                      }`}
                    >
                      {status}:{' '}
                      <strong
                        className={`text-sm px-2 py-0.5 rounded-md transition-all ${
                          isActive
                            ? darkMode ? 'font-black text-white bg-slate-800' : 'font-black text-slate-900 bg-slate-100'
                            : darkMode ? 'font-semibold text-slate-500 bg-slate-800/40' : 'font-semibold text-slate-400 bg-slate-100/60'
                        }`}
                      >
                        {dynamicCountsByStatus[status] || 0}
                      </strong>
                    </span>
                  </label>

                  {index < array.length - 1 && <span className={darkMode ? 'text-slate-700' : 'text-slate-200'}>|</span>}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 uppercase tracking-wider text-xs font-extrabold mr-1">
              Modalidade:
            </span>

            <button
              type="button"
              onClick={() => handleModalityToggle('FM')}
              className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
                selectedModality['FM']
                  ? darkMode ? 'bg-red-950/40 border-red-800 text-red-400 shadow-sm font-black' : 'bg-red-50 border-red-300 text-red-700 shadow-sm font-black'
                  : darkMode ? 'bg-slate-800 border-slate-700 text-slate-500 font-normal' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'
              }`}
            >
              <span>FM</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-xs ${
                  selectedModality['FM']
                    ? darkMode ? 'bg-red-900/60 text-red-300 font-black' : 'bg-red-100 text-red-800 font-black'
                    : darkMode ? 'bg-slate-800 text-slate-500 font-normal' : 'bg-slate-200/60 text-slate-400 font-normal'
                }`}
              >
                {dynamicCountsByModality['FM'] || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModalityToggle('LH')}
              className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95 ${
                selectedModality['LH']
                  ? darkMode ? 'bg-blue-950/40 border-blue-800 text-blue-400 shadow-sm font-black' : 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm font-black'
                  : darkMode ? 'bg-slate-800 border-slate-700 text-slate-500 font-normal' : 'bg-slate-100 border-slate-200 text-slate-400 font-normal'
              }`}
            >
              <span>LH</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-xs ${
                  selectedModality['LH']
                    ? darkMode ? 'bg-blue-900/60 text-blue-300 font-black' : 'bg-blue-100 text-blue-800 font-black'
                    : darkMode ? 'bg-slate-800 text-slate-500 font-normal' : 'bg-slate-200/60 text-slate-400 font-normal'
                }`}
              >
                {dynamicCountsByModality['LH'] || 0}
              </span>
            </button>
          </div>
        </div>

        {/* INDICADOR DE EXIBIÇÃO + PAINEL DE DOCAS */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 px-1">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/60 text-slate-600'}`}>
            Exibindo {filteredTrips.length} de {trips.length} veículos
          </span>

          <div className={`flex flex-wrap items-center gap-2 px-4 py-1.5 rounded-xl shadow-sm border transition-colors duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">
              Docas:
            </span>

            {/* Docas Internas */}
            {DOCKS_INTERNAL.map((dock) => {
              const isOccupied = occupiedDocks.has(dock);
              return (
                <div
                  key={dock}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all border ${
                    isOccupied
                      ? darkMode ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800 font-black' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm shadow-emerald-500/10 font-black'
                      : darkMode ? 'bg-slate-800 text-slate-500 border-slate-700 font-normal' : 'bg-slate-100 text-slate-400 border-slate-200 font-normal'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOccupied
                        ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse'
                        : darkMode ? 'bg-slate-600' : 'bg-slate-400'
                    }`}
                  ></span>
                  <span>{dock}</span>
                </div>
              );
            })}

            {/* Barra Simples de Separação entre Docas Internas e Externas */}
            <div className={`h-5 w-px mx-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>

            {/* Docas Externas */}
            {DOCKS_EXTERNAL.map((dock) => {
              const isOccupied = occupiedDocks.has(dock);
              return (
                <div
                  key={dock}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all border ${
                    isOccupied
                      ? darkMode ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800 font-black' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm shadow-emerald-500/10 font-black'
                      : darkMode ? 'bg-slate-800 text-slate-500 border-slate-700 font-normal' : 'bg-slate-100 text-slate-400 border-slate-200 font-normal'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOccupied
                        ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse'
                        : darkMode ? 'bg-slate-600' : 'bg-slate-400'
                    }`}
                  ></span>
                  <span>{dock}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TABELA DE VEÍCULOS */}
        <main className={`rounded-2xl shadow-sm border overflow-hidden transition-colors duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className={`border-b text-xs font-black uppercase tracking-wider ${darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-100/80 border-slate-200/80 text-slate-600'}`}>
                  <th className="py-4 px-2 w-[4%] text-center"></th>
                  <th className="py-4 px-4 w-[13%]">Nº da Fila</th>
                  <th className="py-4 px-4 w-[13%]">Placa</th>
                  <th className="py-4 px-4 w-[14%] text-center">Tempo Espera</th>
                  <th className="py-4 px-4 w-[13%] text-center">Modalidade</th>
                  <th className="py-4 px-4 w-[15%] text-right">Total Pacotes</th>
                  <th className="py-4 px-4 w-[13%] text-center">Doca</th>
                  <th className="py-4 px-4 w-[15%] text-center">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {filteredTrips.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 font-medium text-base">
                      Nenhuma viagem encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip, index) => {
                    const isExpanded = expandedTripId === trip.id;
                    const previousStatus = index > 0 ? filteredTrips[index - 1].status : null;
                    const isNewStatusGroup = index > 0 && trip.status !== previousStatus;
                    const permStatus = getPermanenceStatus(trip.permanencia, trip.modality || 'LH');

                    let statusBadgeClass = '';
                    let StatusIcon = AlertCircle;

                    if (trip.status === 'Finalizado') {
                      if (permStatus === 'red') {
                        statusBadgeClass = darkMode ? 'bg-red-950/80 text-red-300 border border-red-800' : 'bg-red-100 text-red-800 border border-red-300';
                        StatusIcon = AlertTriangle;
                      } else if (permStatus === 'orange') {
                        statusBadgeClass = darkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-emerald-100 text-emerald-800';
                        StatusIcon = AlertTriangle;
                      } else {
                        statusBadgeClass = darkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-emerald-100 text-emerald-800';
                        StatusIcon = CheckCircle2;
                      }
                    } else if (trip.status === 'Atribuído') {
                      statusBadgeClass = darkMode ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800' : 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                    } else if (trip.status === 'Docado') {
                      statusBadgeClass = darkMode ? 'bg-blue-950/60 text-blue-300' : 'bg-blue-100 text-blue-800';
                    } else {
                      statusBadgeClass = darkMode ? 'bg-amber-950/60 text-amber-300' : 'bg-amber-100 text-amber-800';
                    }

                    const dischargeTime = getDischargeTime(trip.hora_doca, trip.hora_finalizacao);

                    return (
                      <React.Fragment key={trip.id}>
                        {isNewStatusGroup && (
                          <tr key={`sep-${trip.id}`} className={darkMode ? 'bg-slate-950/40' : 'bg-slate-50/30'}>
                            <td colSpan={8} className="py-2.5 px-6">
                              <div className={`h-px w-full border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}></div>
                            </td>
                          </tr>
                        )}

                        <tr 
                          onClick={() => toggleRowExpand(trip.id)}
                          className={`cursor-pointer transition-colors font-medium ${
                            isExpanded 
                              ? darkMode ? 'bg-amber-950/40 text-white' : 'bg-amber-100/70 text-slate-800' 
                              : darkMode ? 'hover:bg-slate-800/50 text-slate-200' : 'hover:bg-slate-50/80 text-slate-800'
                          }`}
                        >
                          <td className="py-4 px-2 text-center text-slate-400">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-orange-500 mx-auto" />
                            ) : (
                              <ChevronRight className="w-5 h-5 mx-auto" />
                            )}
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className={`inline-block px-3 py-1 rounded-lg font-black text-lg ${
                              darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'
                            }`}>
                              {trip.origin || '-'}
                            </span>
                          </td>

                          <td className={`py-4 px-4 font-bold text-base uppercase whitespace-nowrap ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {trip.vehicle_plate || '-'}
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 font-bold px-3 py-1 rounded-full text-xs sm:text-sm ${
                              darkMode ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              <Clock className="w-4 h-4" />
                              {trip.waiting_time || '00:00'}
                            </span>
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span 
                              className={`inline-block px-3 py-1 rounded-lg font-black text-xs sm:text-sm ${
                                trip.modality === 'FM'
                                  ? darkMode ? 'bg-red-950/50 text-red-400' : 'bg-red-100 text-red-700'
                                  : darkMode ? 'bg-blue-950/50 text-blue-400' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {trip.modality || 'LH'}
                            </span>
                          </td>

                          <td className={`py-4 px-4 text-right font-bold text-base whitespace-nowrap ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {(trip.total_packages || 0).toLocaleString('pt-BR')} <span className="text-xs font-bold text-slate-400">pcs</span>
                          </td>

                          <td className={`py-4 px-4 text-center font-bold text-base whitespace-nowrap ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {trip.dock_number || '-'}
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase ${statusBadgeClass}`}>
                              <StatusIcon className="w-4 h-4" />
                              <span>{trip.status || 'Em fila'}</span>
                            </span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className={darkMode ? 'bg-slate-950/60 border-t border-b border-slate-800' : 'bg-amber-50/50 border-t border-b border-amber-200/80'}>
                            <td colSpan={8} className="p-4 sm:p-5">
                              <div className={`p-5 rounded-2xl border shadow-sm transition-colors duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
                                <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-orange-500" />
                                  <span>Detalhes do Veículo ({trip.origin})</span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 sm:gap-4">
                                  <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Motorista
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 truncate ${darkMode ? 'text-slate-100' : 'text-slate-800'}`} title={trip.driver_name || '-'}>
                                      {trip.driver_name || '-'}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Nº da LT
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 truncate ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                                      {trip.modality === 'FM' ? '-' : (trip.lt_number || '-')}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Tempo de Descarga
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`}>
                                      {dischargeTime}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Tempo de Permanência
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 ${getPermanenceTextColor(permStatus, darkMode)}`}>
                                      {trip.permanencia || '-'}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Sacas
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {trip.volume_saca ?? 0}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Scuttles
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {trip.volume_scuttle ?? 0}
                                    </span>
                                  </div>

                                  <div className={`p-3 rounded-xl border text-center ${darkMode ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-100'}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                      Pallets
                                    </span>
                                    <span className={`font-bold text-sm block mt-0.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                      {trip.volume_pallet ?? 0}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
