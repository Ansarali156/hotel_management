import { useTranslation } from 'react-i18next';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { getCriminals, bulkUploadCriminals } from '../api/police.api';
import PoliceLayout from '../components/PoliceLayout';
import { format } from 'date-fns';

const THREAT_CHIP: Record<string, string> = {
  CRITICAL: 'bg-p-error-container text-p-on-error-container',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-p-surface-container-highest text-p-outline',
};

const STATUS_CHIP: Record<string, string> = {
  ABSCONDING: 'bg-p-error text-white border border-p-error',
  WANTED: 'border border-p-error text-p-error',
  IN_CUSTODY: 'bg-p-secondary-container text-p-on-secondary-container',
  ARRESTED: 'bg-p-secondary-container text-p-on-secondary-container',
  UNDER_INVESTIGATION: 'bg-amber-100 text-amber-700',
  PAROLE: 'bg-slate-100 text-slate-600',
  RELEASED: 'bg-p-surface-container-highest text-p-on-surface-variant',
};

// Excel column → API field mapping
const COLUMN_MAP: Record<string, string> = {
  Name: 'fullName',
  FullName: 'fullName',
  'Full Name': 'fullName',
  Alias: 'aliases',
  Aliases: 'aliases',
  Aadhaar: 'aadhaarNumber',
  AadhaarNumber: 'aadhaarNumber',
  'Aadhaar Number': 'aadhaarNumber',
  Passport: 'passportNumber',
  PassportNumber: 'passportNumber',
  'Passport Number': 'passportNumber',
  VoterID: 'voterId',
  'Voter ID': 'voterId',
  DrivingLicence: 'drivingLicense',
  DrivingLicense: 'drivingLicense',
  'Driving Licence': 'drivingLicense',
  'Driving License': 'drivingLicense',
  CrimeType: 'crimeType',
  'Crime Type': 'crimeType',
  ThreatLevel: 'threatLevel',
  'Threat Level': 'threatLevel',
  Status: 'caseStatus',
  CaseStatus: 'caseStatus',
  'Case Status': 'caseStatus',
  Notes: 'crimeDescription',
  Description: 'crimeDescription',
};

function normaliseRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const trimmedKey = String(key).trim();
    const mapped = COLUMN_MAP[trimmedKey] ?? trimmedKey;
    out[mapped] = typeof val === 'string' ? val.trim() : val;
  }
  // Ensure aliases is an array
  if (out.aliases && !Array.isArray(out.aliases)) {
    out.aliases = String(out.aliases).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'Name', 'Alias', 'Aadhaar', 'Passport', 'VoterID', 'DrivingLicence',
      'CrimeType', 'ThreatLevel', 'Status', 'Notes',
    ],
    [
      'Ravi Kumar', 'Ravi', '123456789012', 'A1234567', 'ABC1234567', 'TN0120190012345',
      'Murder', 'HIGH', 'WANTED', 'Armed and dangerous',
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Criminal Profiles');
  XLSX.writeFile(wb, 'criminal_profiles_template.xlsx');
}

export default function Criminals() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [threatFilter, setThreatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Excel upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = useState('');
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    failed: number;
    errors: Array<{ row: number; name?: string; error: string }>;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['police-criminals', { search, threatFilter, statusFilter, page }],
    queryFn: () =>
      getCriminals({
        search: search || undefined,
        threatLevel: threatFilter || undefined,
        caseStatus: statusFilter || undefined,
        page,
        limit,
      }),
    placeholderData: (prev) => prev,
  });

  const criminals = (data as any)?.criminals ?? (data as any)?.profiles ?? [];
  const total = (data as any)?.total ?? (data as any)?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const bulkMutation = useMutation({
    mutationFn: bulkUploadCriminals,
    onSuccess: (result) => {
      setUploadResult(result);
      queryClient.invalidateQueries({ queryKey: ['police-criminals'] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError('');
    setParsedRows([]);
    setUploadResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: false,
        });
        if (rawRows.length === 0) {
          setParseError('No data rows found in the spreadsheet.');
          return;
        }
        if (rawRows.length > 2000) {
          setParseError('Maximum 2000 records per upload. Split the file and try again.');
          return;
        }
        const normalised = rawRows.map(normaliseRow);
        setParsedRows(normalised);
        setShowUploadModal(true);
      } catch {
        setParseError('Failed to parse the file. Ensure it is a valid .xlsx or .csv.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so the same file can be re-selected after errors
    e.target.value = '';
  };

  const handleUploadConfirm = () => {
    bulkMutation.mutate(parsedRows);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setParsedRows([]);
    setUploadResult(null);
    setParseError('');
    setEditingCell(null);
  };

  return (
    <PoliceLayout>
      <div className="p-4 md:p-8 max-w-[1440px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="font-headline text-3xl font-extrabold text-p-on-surface tracking-tight">{t('police.criminalsTitle')}</h1>
          <p className="text-p-on-surface-variant font-medium">{t('police.criminalsSubtitle')}</p>
        </header>

        {/* Action bar */}
        <div className="flex flex-col gap-3 mb-6 bg-p-surface-container-low p-4 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-p-outline-variant text-lg">search</span>
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t('police.searchCriminals')}
                className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-lg focus:ring-2 focus:ring-p-primary/20 text-sm font-brand outline-none"
              />
            </div>
            {/* Upload Excel button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg font-brand font-bold flex items-center gap-1 shadow-sm hover:opacity-90 transition-all shrink-0 text-sm"
              title="Upload Excel Sheet"
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              <span className="hidden sm:inline">{t('police.uploadExcel')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={threatFilter}
              onChange={(e) => { setThreatFilter(e.target.value); setPage(1); }}
              className="flex-1 bg-white border-none rounded-lg py-2 px-3 text-sm font-brand text-p-on-surface-variant focus:ring-2 focus:ring-p-primary/20 outline-none"
            >
              <option value="">Threat: All</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="flex-1 bg-white border-none rounded-lg py-2 px-3 text-sm font-brand text-p-on-surface-variant focus:ring-2 focus:ring-p-primary/20 outline-none"
            >
              <option value="">Status: All</option>
              <option value="WANTED">Wanted</option>
              <option value="ABSCONDING">Absconding</option>
              <option value="ARRESTED">Arrested</option>
              <option value="RELEASED">Released</option>
            </select>
          </div>
          {parseError && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-base">error</span>
              {parseError}
            </p>
          )}
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-3 mb-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : criminals.length === 0 ? (
            <p className="text-center py-12 text-p-on-surface-variant">{t('police.noProfiles')}</p>
          ) : criminals.map((c: any) => (
            <div
              key={c.id}
              onClick={() => navigate(`/police/criminals/${c.id}`)}
              className="bg-white rounded-xl p-4 border border-p-outline-variant/10 shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3 mb-2">
                {c.photoUrl ? (
                  <img src={c.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-p-error/20" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-p-surface-container-highest flex items-center justify-center">
                    <span className="material-symbols-outlined text-p-outline text-sm">person</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-p-on-surface truncate">{c.fullName}</p>
                  {c.aliases && c.aliases.length > 0 && (
                    <p className="text-[10px] text-p-on-surface-variant uppercase">Alias: {c.aliases[0]}</p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${THREAT_CHIP[c.threatLevel] ?? ''}`}>
                  {c.threatLevel}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CHIP[c.caseStatus] ?? 'bg-slate-100 text-slate-500'}`}>
                  {c.caseStatus?.replace(/_/g, ' ')}
                </span>
                <span className="text-p-on-surface-variant truncate">
                  {Array.isArray(c.crimeTypes) ? c.crimeTypes.slice(0, 2).join(', ') : c.crimeType}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl overflow-hidden shadow-sm border border-p-outline-variant/10">
          <table className="w-full text-left border-collapse font-brand">
            <thead>
              <tr className="bg-p-surface-container-high h-12 text-[11px] uppercase tracking-wider text-p-on-surface-variant font-bold">
                <th className="px-6">{t('police.subject')}</th>
                <th className="px-6">{t('police.crimeType')}</th>
                <th className="px-6">{t('police.threatLevel')}</th>
                <th className="px-6">{t('police.caseStatus')}</th>
                <th className="px-6 text-right">{t('police.lastUpdated')}</th>
                <th className="px-6 text-center">{t('police.actions')}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-p-on-surface-variant">
                      <div className="w-5 h-5 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </div>
                  </td>
                </tr>
              ) : criminals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-p-on-surface-variant">{t('police.noProfiles')}</td>
                </tr>
              ) : criminals.map((c: any, i: number) => (
                <tr
                  key={c.id}
                  className={`h-14 hover:bg-p-surface-container-high transition-colors cursor-pointer ${i % 2 === 0 ? 'bg-[#f8f9fa]' : 'bg-[#f1f4f6]'}`}
                  onClick={() => navigate(`/police/criminals/${c.id}`)}
                >
                  <td className="px-6">
                    <div className="flex items-center gap-3">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-p-error/20" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-p-surface-container-highest flex items-center justify-center ring-2 ring-p-outline/10">
                          <span className="material-symbols-outlined text-p-outline text-sm">person</span>
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-p-on-surface">{c.fullName}</div>
                        {c.aliases && c.aliases.length > 0 && (
                          <div className="text-[10px] text-p-on-surface-variant uppercase font-semibold">
                            Alias: {c.aliases[0]}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 text-p-on-secondary-container font-medium">
                    {Array.isArray(c.crimeTypes) ? c.crimeTypes.slice(0, 2).join(', ') : c.crimeType}
                  </td>
                  <td className="px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${THREAT_CHIP[c.threatLevel] ?? ''}`}>
                      {c.threatLevel}
                    </span>
                  </td>
                  <td className="px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${STATUS_CHIP[c.caseStatus] ?? 'bg-slate-100 text-slate-500'}`}>
                      {c.caseStatus?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 text-right text-p-on-surface-variant text-xs">
                    {format(new Date(c.updatedAt ?? c.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-6">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/police/criminals/${c.id}`); }}
                        className="p-1.5 hover:bg-p-primary-container text-p-primary rounded-md transition-all"
                      >
                        <span className="material-symbols-outlined text-lg">visibility</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/police/criminals/${c.id}/edit`); }}
                        className="p-1.5 hover:bg-p-surface-container-highest text-p-outline rounded-md transition-all"
                      >
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <footer className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-2">
          <div className="text-sm font-brand text-p-on-surface-variant">
            Showing <span className="font-bold text-p-on-surface">{(page - 1) * limit + 1}–{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-bold text-p-on-surface">{total}</span> profiles
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-2 hover:bg-p-surface-container-high rounded-lg text-p-outline-variant transition-all disabled:opacity-30"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = i + 1;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm ${
                    pg === page
                      ? 'bg-p-primary text-white shadow-md'
                      : 'hover:bg-p-surface-container-high text-p-on-surface'
                  }`}
                >
                  {pg}
                </button>
              );
            })}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-2 hover:bg-p-surface-container-high rounded-lg text-p-outline-variant transition-all disabled:opacity-30"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </footer>
      </div>

      {/* ── Excel Upload Modal ─────────────────────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-p-on-surface font-brand">{t('police.bulkUpload')}</h2>
                <p className="text-sm text-p-on-surface-variant">
                  {uploadResult
                    ? `Upload complete`
                    : `${parsedRows.length} records ready to import`}
                </p>
              </div>
              <button onClick={closeUploadModal} className="p-2 hover:bg-slate-100 rounded-lg">
                <span className="material-symbols-outlined text-p-outline">close</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6">
              {!uploadResult ? (
                <>
                  {/* Editable preview info */}
                  <div className="flex items-center gap-2 mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-blue-600 text-base">edit_note</span>
                    <p className="text-xs text-blue-700 font-medium">
                      Click any cell to edit before importing. Review all data carefully.
                    </p>
                  </div>

                  {/* Editable preview table */}
                  <div className="overflow-x-auto mb-4 rounded-lg border border-slate-200 max-h-[45vh]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-2 font-bold text-p-on-surface-variant text-center w-8">#</th>
                          {Object.keys(parsedRows[0] ?? {}).map((k) => (
                            <th key={k} className="px-3 py-2 font-bold text-p-on-surface-variant uppercase whitespace-nowrap">{k}</th>
                          ))}
                          <th className="px-2 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((row, i) => {
                          const cols = Object.keys(row);
                          const hasName = !!String(row.fullName ?? '').trim();
                          const hasThreat = !!String(row.threatLevel ?? '').trim();
                          const hasStatus = !!String(row.caseStatus ?? '').trim();
                          const isInvalid = !hasName || !hasThreat || !hasStatus;
                          return (
                            <tr key={i} className={`border-t border-slate-100 ${isInvalid ? 'bg-red-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                              <td className="px-2 py-1.5 text-center text-p-on-surface-variant font-mono">{i + 1}</td>
                              {cols.map((col) => {
                                const isEditing = editingCell?.row === i && editingCell?.col === col;
                                const val = String(row[col] ?? '');
                                const isRequired = ['fullName', 'threatLevel', 'caseStatus'].includes(col);
                                const isEmpty = isRequired && !val.trim();
                                return (
                                  <td key={col} className="px-1 py-0.5">
                                    {isEditing ? (
                                      col === 'threatLevel' ? (
                                        <select
                                          autoFocus
                                          value={val}
                                          onChange={(e) => {
                                            setParsedRows((prev) => {
                                              const next = [...prev];
                                              next[i] = { ...next[i], [col]: e.target.value };
                                              return next;
                                            });
                                          }}
                                          onBlur={() => setEditingCell(null)}
                                          className="w-full px-2 py-1 text-xs rounded border border-p-primary bg-white focus:outline-none focus:ring-1 focus:ring-p-primary"
                                        >
                                          <option value="">Select…</option>
                                          <option value="CRITICAL">CRITICAL</option>
                                          <option value="HIGH">HIGH</option>
                                          <option value="MEDIUM">MEDIUM</option>
                                          <option value="LOW">LOW</option>
                                        </select>
                                      ) : col === 'caseStatus' ? (
                                        <select
                                          autoFocus
                                          value={val}
                                          onChange={(e) => {
                                            setParsedRows((prev) => {
                                              const next = [...prev];
                                              next[i] = { ...next[i], [col]: e.target.value };
                                              return next;
                                            });
                                          }}
                                          onBlur={() => setEditingCell(null)}
                                          className="w-full px-2 py-1 text-xs rounded border border-p-primary bg-white focus:outline-none focus:ring-1 focus:ring-p-primary"
                                        >
                                          <option value="">Select…</option>
                                          <option value="WANTED">WANTED</option>
                                          <option value="ARRESTED">ARRESTED</option>
                                          <option value="ABSCONDING">ABSCONDING</option>
                                          <option value="RELEASED">RELEASED</option>
                                          <option value="IN_CUSTODY">IN_CUSTODY</option>
                                          <option value="UNDER_INVESTIGATION">UNDER_INVESTIGATION</option>
                                          <option value="PAROLE">PAROLE</option>
                                        </select>
                                      ) : (
                                        <input
                                          autoFocus
                                          value={val}
                                          onChange={(e) => {
                                            setParsedRows((prev) => {
                                              const next = [...prev];
                                              next[i] = { ...next[i], [col]: e.target.value };
                                              return next;
                                            });
                                          }}
                                          onBlur={() => setEditingCell(null)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingCell(null); }}
                                          className="w-full px-2 py-1 text-xs rounded border border-p-primary bg-white focus:outline-none focus:ring-1 focus:ring-p-primary"
                                        />
                                      )
                                    ) : (
                                      <div
                                        onClick={() => setEditingCell({ row: i, col })}
                                        className={`px-2 py-1.5 rounded cursor-pointer hover:bg-blue-50 transition-colors truncate max-w-[160px] ${isEmpty ? 'bg-red-100 text-red-600 italic' : ''}`}
                                        title={val || (isRequired ? 'Required — click to edit' : 'Click to edit')}
                                      >
                                        {val || (isRequired ? 'Required' : '—')}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-1 py-0.5">
                                <button
                                  onClick={() => setParsedRows((prev) => prev.filter((_, idx) => idx !== i))}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Remove row"
                                >
                                  <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-p-on-surface-variant">
                      Required: <span className="font-bold text-p-on-surface">Name, ThreatLevel, Status</span>.{' '}
                      <button onClick={downloadTemplate} className="text-p-primary underline font-semibold">
                        Download template
                      </button>
                    </p>
                    {parsedRows.some((r) => !String(r.fullName ?? '').trim() || !String(r.threatLevel ?? '').trim() || !String(r.caseStatus ?? '').trim()) && (
                      <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        {parsedRows.filter((r) => !String(r.fullName ?? '').trim() || !String(r.threatLevel ?? '').trim() || !String(r.caseStatus ?? '').trim()).length} rows have missing required fields
                      </span>
                    )}
                  </div>
                </>
              ) : (
                /* Upload result summary */
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <p className="text-3xl font-black text-emerald-700">{uploadResult.inserted}</p>
                      <p className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Inserted</p>
                    </div>
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                      <p className="text-3xl font-black text-red-700">{uploadResult.failed}</p>
                      <p className="text-sm font-bold text-red-600 uppercase tracking-wide">Failed</p>
                    </div>
                  </div>
                  {uploadResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-48 overflow-y-auto">
                      <p className="text-xs font-bold text-red-700 uppercase mb-2">Errors</p>
                      {uploadResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600 py-0.5 border-b border-red-100">
                          Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.error}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              {!uploadResult ? (
                <>
                  <button
                    onClick={closeUploadModal}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-p-on-surface-variant text-sm font-bold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadConfirm}
                    disabled={bulkMutation.isPending}
                    className="px-6 py-2 bg-[#1B4332] text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {bulkMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">upload</span>
                        Import {parsedRows.length} Records
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={closeUploadModal}
                  className="px-6 py-2 bg-[#1B4332] text-white rounded-lg text-sm font-bold hover:opacity-90"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PoliceLayout>
  );
}
