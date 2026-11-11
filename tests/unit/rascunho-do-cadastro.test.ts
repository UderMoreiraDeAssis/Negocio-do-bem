import { describe, expect, it } from "vitest";
import { contatoDoRascunho, lerRascunho, VOLTA_AO_CADASTRO, voltaAoCadastro } from "@/lib/rascunho-do-cadastro";

describe("voltaAoCadastro", () => {
  it("reconhece o caminho de volta do cadastro por etapas", () => {
    expect(voltaAoCadastro(VOLTA_AO_CADASTRO)).toBe(true);
    expect(voltaAoCadastro("/participar?continuar=1")).toBe(true);
    expect(voltaAoCadastro("/participar?instagram=padaria&continuar=1#cadastro")).toBe(true);
  });

  it("fora do cadastro, não", () => {
    expect(voltaAoCadastro("/")).toBe(false);
    expect(voltaAoCadastro("/painel")).toBe(false);
    expect(voltaAoCadastro("/participar")).toBe(false);
    expect(voltaAoCadastro("/participar?continuar=0")).toBe(false);
    expect(voltaAoCadastro("/participar/outra?continuar=1")).toBe(false);
    expect(voltaAoCadastro("//outro.site/participar?continuar=1")).toBe(false);
    expect(voltaAoCadastro("https://outro.site/participar?continuar=1")).toBe(false);
  });
});

describe("contatoDoRascunho", () => {
  it("o dono traz o e-mail e o telefone que deu no cadastro", () => {
    const rascunho = lerRascunho({
      souDono: "sim",
      nome: "Padaria Flor",
      emailContato: "contato@padaria.com",
      whatsapp: "(11) 3333-4444",
      emailDoDono: "  maria@email.com ",
      telefoneDoDono: "(11) 99148-8052",
    });
    expect(contatoDoRascunho(rascunho)).toEqual({ email: "maria@email.com", telefone: "(11) 99148-8052" });
  });

  it("o nome do negócio e os contatos dele não viram dados da conta", () => {
    const rascunho = lerRascunho({ souDono: "sim", nome: "Padaria Flor", emailContato: "contato@padaria.com", whatsapp: "11999998888" });
    expect(contatoDoRascunho(rascunho)).toEqual({ email: "", telefone: "" });
  });

  it("só com um dos dois, o outro fica vazio", () => {
    expect(contatoDoRascunho(lerRascunho({ souDono: "sim", telefoneDoDono: "11 99148-8052" }))).toEqual({ email: "", telefone: "11 99148-8052" });
  });

  it("quem só indicou não deu contato", () => {
    const rascunho = lerRascunho({ souDono: "", emailDoDono: "maria@email.com", telefoneDoDono: "(11) 99148-8052" });
    expect(contatoDoRascunho(rascunho)).toEqual({ email: "", telefone: "" });
  });

  it("sem rascunho, nada", () => {
    expect(contatoDoRascunho(null)).toEqual({ email: "", telefone: "" });
  });
});
