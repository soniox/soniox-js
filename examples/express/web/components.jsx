export function Input({ label, value, onChange, placeholder, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 font-semibold ${className}`}>
      {label}
      <input
        type="text"
        className="px-3 py-2 text-base font-normal border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onInput={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Select({ label, value, onChange, options, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 font-semibold ${className}`}>
      {label}
      <select
        className="px-3 py-2 text-base font-normal border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 font-semibold cursor-pointer">
      <input type="checkbox" className="w-4 h-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Button({ children, onClick, disabled, variant = 'primary' }) {
  const base =
    'px-4 py-2 text-base font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
  };
  return (
    <button className={`${base} ${variants[variant]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Panel({ title, children }) {
  return (
    <div className="mt-4 p-4 border border-gray-300 rounded-lg">
      {title && <div className="text-sm text-gray-500 mb-2">{title}</div>}
      {children}
    </div>
  );
}

export function formatTime(ms) {
  return ms === undefined ? '?' : (ms / 1000).toFixed(2) + 's';
}
