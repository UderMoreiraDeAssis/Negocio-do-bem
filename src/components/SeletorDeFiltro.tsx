/** Um filtro de lista (área, contratação, estado…) num formulário GET. */
export function SeletorDeFiltro({
  id,
  rotulo,
  valor,
  opcoes,
  vazio,
}: {
  id: string;
  rotulo: string;
  valor?: string;
  opcoes: (readonly [string, string])[] | [string, string][];
  vazio: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <select id={id} name={id} defaultValue={valor ?? ""} className="campo">
        <option value="">{vazio}</option>
        {opcoes.map(([chave, nome]) => (
          <option key={chave} value={chave}>
            {nome}
          </option>
        ))}
      </select>
    </div>
  );
}
