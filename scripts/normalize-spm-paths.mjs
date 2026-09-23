// Mantém portáteis os caminhos do `ios/App/CapApp-SPM/Package.swift`.
//
// A CLI do Capacitor monta o caminho de cada plugin com `path.relative()` e o
// grava como saiu. No Windows isso são barras invertidas
// (`..\..\..\node_modules\@capacitor\share`), que o Swift Package Manager não
// resolve: a build do iOS quebra no Mac. O lado Android da mesma CLI passa os
// caminhos por `convertToUnixPath`; o do iOS não — e a CLI não tem opção para
// isso.
//
// O ponto de encaixe é o hook `capacitor:update:after` (ver `package.json`).
// Todo comando que reescreve o arquivo (`sync`, `update`, `add`, `run`) passa
// por `update()`, que é onde o hook roda, e roda seja qual for o jeito de
// chamar a CLI — `npx cap sync ios` direto ou pelos scripts do projeto.
//
// Uso:
//   node scripts/normalize-spm-paths.mjs           corrige e segue (o hook)
//   node scripts/normalize-spm-paths.mjs --check   só confere; falha se houver
//                                                  barra invertida ou caminho
//                                                  absoluto (o `lint`)
//
// O `--check` é a segunda trava: pega o arquivo estragado por qualquer outro
// caminho (checkout antigo sem o hook, edição à mão, merge, um `cap sync`
// interrompido antes de o hook rodar) antes do commit.
//
// Códigos de saída: 0 tudo certo · 1 arquivo com problema ou ilegível ·
// 2 argumento desconhecido.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Relativo ao próprio script, e não ao diretório de onde ele foi chamado: o
// hook roda com o `cwd` da CLI, e o `lint` roda de onde o `npm` estiver.
const PACKAGE_SWIFT = fileURLToPath(
  new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url)
);

const BACKSLASH = '\\';
const USAGE = 'Uso: node scripts/normalize-spm-paths.mjs [--check]';

// O valor entre aspas do argumento `path:` — o único lugar onde a CLI grava
// caminho de arquivo. Restringir a ele evita mexer em qualquer outra coisa do
// arquivo (uma sequência de escape do Swift, por exemplo).
const PATH_ARGUMENT = /(path:\s*")([^"\n]*)(")/g;

// Unidade de disco (`C:`) ou raiz (`/`, `//servidor`). Um caminho de plugin
// legítimo é sempre relativo: quando o plugin está em outro drive, a CLI cai
// num caminho absoluto, e esse não resolve em nenhuma outra máquina.
const ABSOLUTE_PATH = /^(?:[A-Za-z]:|\/)/;

function normalize(text) {
  let fixed = 0;

  const result = text.replace(PATH_ARGUMENT, (whole, open, value, close) => {
    if (!value.includes(BACKSLASH)) return whole;

    fixed += 1;
    return open + value.split(BACKSLASH).join('/') + close;
  });

  return { result, fixed };
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * Tudo que torna o arquivo inutilizável fora desta máquina.
 *
 * O arquivo inteiro é gerado pela CLI e não tem motivo para conter uma barra
 * invertida — por isso vale qualquer uma, não só as de `path:`.
 */
function findProblems(text) {
  const problems = [];

  text.split('\n').forEach((line, index) => {
    if (line.includes(BACKSLASH)) {
      problems.push({ number: index + 1, line: line.trim(), reason: 'barra invertida' });
    }
  });

  // Varre o texto inteiro (e não linha a linha) porque o `path:` pode ter
  // quebra de linha antes das aspas.
  for (const match of text.matchAll(PATH_ARGUMENT)) {
    if (!ABSOLUTE_PATH.test(match[2].split(BACKSLASH).join('/'))) continue;

    problems.push({
      number: lineNumberAt(text, match.index),
      line: match[0].trim(),
      reason: 'caminho absoluto',
    });
  }

  return problems;
}

function report(message) {
  process.stderr.write(`normalize-spm-paths: ${message}\n`);
}

function reportProblems(problems) {
  problems.forEach(({ number, line, reason }) => report(`  linha ${number} (${reason}): ${line}`));
}

function fail(code) {
  process.exitCode = code;
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--check');

  // Sem isto, `--chek` cairia no modo de correção e reescreveria o arquivo
  // achando que só conferia.
  if (unknown.length > 0) {
    report(`argumento desconhecido: ${unknown.join(' ')}`);
    report(USAGE);
    fail(2);
    return;
  }

  const checkOnly = args.includes('--check');

  // A CLI roda o hook para toda plataforma que sincroniza, e só o iOS reescreve
  // este arquivo. Sem esta saída, um problema no arquivo do iOS derrubaria
  // também o `cap sync android`. O `--check` não passa por aqui: o `lint`
  // confere sempre.
  const platform = process.env.CAPACITOR_PLATFORM_NAME;
  if (!checkOnly && platform && platform !== 'ios') return;

  // Clone sem a pasta do iOS, ou plataforma ainda não adicionada: não há o que
  // conferir, e isso não é erro.
  if (!existsSync(PACKAGE_SWIFT)) return;

  let original;
  try {
    original = readFileSync(PACKAGE_SWIFT, 'utf8');
  } catch (error) {
    report(`não foi possível ler ${PACKAGE_SWIFT} (${error.code ?? error.message})`);
    fail(1);
    return;
  }

  if (checkOnly) {
    const problems = findProblems(original);
    if (problems.length === 0) return;

    report('o Package.swift do iOS tem caminho que quebra a build no Mac:');
    reportProblems(problems);
    report('Corrija com: node scripts/normalize-spm-paths.mjs');
    fail(1);
    return;
  }

  const { result, fixed } = normalize(original);

  // Sobrou algo que este script não sabe consertar (barra fora de `path:`,
  // caminho absoluto). Tudo ou nada: o arquivo só é regravado quando fica
  // inteiramente correto, e o erro sai alto em vez de seguir calado.
  const remaining = findProblems(result);
  if (remaining.length > 0) {
    report('o Package.swift do iOS tem problema que não dá para corrigir sozinho:');
    reportProblems(remaining);
    fail(1);
    return;
  }

  if (fixed === 0) return;

  try {
    writeFileSync(PACKAGE_SWIFT, result, 'utf8');
  } catch (error) {
    report(`não foi possível gravar ${PACKAGE_SWIFT} (${error.code ?? error.message})`);
    fail(1);
    return;
  }

  process.stdout.write(
    `Package.swift do iOS: ${fixed} caminho(s) corrigido(s) para barras normais.\n`
  );
}

main();
