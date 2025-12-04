// src/components/CostosChartPanel.jsx
import React, { useMemo } from "react";

export default function CostosChartPanel({
  chartEntries,
  maxChartValue,
  chartGrouping,
  chartType,
  onChangeChartGrouping,
  onChangeChartType,
}) {
  // Cálculo de datos para pastel (solo presentación)
  const pieData = useMemo(() => {
    if (!chartEntries.length) return { total: 0, segments: [] };

    const total = chartEntries.reduce((s, e) => s + e.total, 0);
    if (total <= 0) return { total: 0, segments: [] };

    const palette = [
      "#6366F1",
      "#22C55E",
      "#F97316",
      "#E11D48",
      "#14B8A6",
      "#A855F7",
      "#0EA5E9",
      "#84CC16",
    ];

    let accumulated = 0;
    const segments = chartEntries.map((e, idx) => {
      const value = e.total;
      const angle = (value / total) * 360;
      const start = accumulated;
      const end = accumulated + angle;
      accumulated = end;
      return {
        ...e,
        start,
        end,
        color: palette[idx % palette.length],
      };
    });

    return { total, segments };
  }, [chartEntries]);

  const pieGradient = useMemo(() => {
    if (!pieData.segments.length) return "";
    return pieData.segments
      .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
      .join(", ");
  }, [pieData]);

  const hasData = chartEntries.length > 0 && maxChartValue > 0;

  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-100 p-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">
          Visualización gráfica de costos
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Agrupar por:</span>
            <select
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={chartGrouping}
              onChange={(e) => onChangeChartGrouping(e.target.value)}
            >
              <option value="actividad">Actividad</option>
              <option value="persona">Persona</option>
              <option value="geocerca">Geocerca</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Tipo:</span>
            <select
              className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={chartType}
              onChange={(e) => onChangeChartType(e.target.value)}
            >
              <option value="bar">Barras</option>
              <option value="line">Líneas</option>
              <option value="pie">Pastel</option>
            </select>
          </div>
        </div>
      </div>

      {!hasData ? (
        <p className="text-xs text-gray-500">
          No hay datos suficientes para generar el gráfico con los filtros
          actuales.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico principal */}
          <div className="lg:col-span-2">
            {chartType === "bar" && (
              <div className="relative h-56 px-2">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-dashed border-gray-200" />
                  <div className="border-t border-dashed border-gray-200" />
                  <div className="border-t border-dashed border-gray-200" />
                </div>

                <div className="relative h-full flex items-end gap-3">
                  {chartEntries.map((e, idx) => {
                    const scaledPct =
                      maxChartValue > 0
                        ? 10 + (e.total / maxChartValue) * 80
                        : 0;

                    return (
                      <div
                        key={`${e.label}-${e.currency}-bar-${idx}`}
                        className="flex-1 flex flex-col items-center min-w-[50px] h-full"
                      >
                        <div className="mb-1 text-[10px] text-gray-600 font-semibold whitespace-nowrap">
                          {e.currency}{" "}
                          {e.total.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className="w-full rounded-t-md bg-indigo-500 shadow-sm"
                            style={{ height: `${scaledPct}%` }}
                            title={`${e.label} (${e.currency}) - ${e.total.toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {chartType === "line" && (
              <div className="h-56">
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full text-indigo-500"
                  preserveAspectRatio="none"
                >
                  <line
                    x1="0"
                    y1="100"
                    x2="100"
                    y2="100"
                    stroke="#E5E7EB"
                    strokeWidth="0.5"
                  />
                  <line
                    x1="0"
                    y1="66"
                    x2="100"
                    y2="66"
                    stroke="#E5E7EB"
                    strokeWidth="0.3"
                    strokeDasharray="1 2"
                  />
                  <line
                    x1="0"
                    y1="33"
                    x2="100"
                    y2="33"
                    stroke="#E5E7EB"
                    strokeWidth="0.3"
                    strokeDasharray="1 2"
                  />

                  {chartEntries.length > 0 && (
                    <>
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        points={chartEntries
                          .map((e, i) => {
                            const x =
                              (i / Math.max(chartEntries.length - 1, 1)) * 100;
                            const y =
                              100 -
                              (maxChartValue > 0
                                ? (e.total / maxChartValue) * 100
                                : 0);
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />
                      {chartEntries.map((e, i) => {
                        const x =
                          (i / Math.max(chartEntries.length - 1, 1)) * 100;
                        const y =
                          100 -
                          (maxChartValue > 0
                            ? (e.total / maxChartValue) * 100
                            : 0);
                        return (
                          <circle
                            key={`${e.label}-${i}-point`}
                            cx={x}
                            cy={y}
                            r={1.5}
                            fill="currentColor"
                          />
                        );
                      })}
                    </>
                  )}
                </svg>
              </div>
            )}

            {chartType === "pie" && (
              <div className="flex flex-col items-center justify-center h-56">
                <div
                  className="relative w-40 h-40 rounded-full shadow-sm"
                  style={{
                    backgroundImage: `conic-gradient(${pieGradient})`,
                  }}
                >
                  <div className="absolute inset-6 bg-white rounded-full flex items-center justify-center">
                    <div className="text-[11px] text-center text-gray-600">
                      Total{" "}
                      <span className="block text-sm font-semibold text-gray-900">
                        {pieData.total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ranking / leyenda derecha */}
          <div className="border-l border-gray-100 pl-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Top {Math.min(chartEntries.length, 6)}{" "}
              {chartGrouping === "actividad"
                ? "actividades"
                : chartGrouping === "persona"
                ? "personas"
                : "geocercas"}
            </p>

            {chartType === "pie" && pieData.segments.length > 0 && (
              <div className="mb-3 space-y-1 text-[11px]">
                {pieData.segments.slice(0, 6).map((s, idx) => (
                  <div
                    key={`${s.label}-legend-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate">{s.label}</span>
                    </div>
                    <span className="whitespace-nowrap text-gray-700">
                      {((s.total / pieData.total) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            <ul className="space-y-1 text-[11px] text-gray-600 max-h-56 overflow-y-auto">
              {chartEntries.slice(0, 6).map((e, idx) => (
                <li
                  key={`${e.label}-${e.currency}-rank-${idx}`}
                  className="flex justify-between gap-2 border-b border-gray-100 pb-1"
                >
                  <span className="truncate">
                    <span className="font-medium text-gray-800">
                      {idx + 1}.
                    </span>{" "}
                    {e.label}
                  </span>
                  <span className="whitespace-nowrap font-semibold">
                    {e.currency}{" "}
                    {e.total.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
