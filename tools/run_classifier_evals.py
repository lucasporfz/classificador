"""Runs the experimental classifier evaluations required by AGENTS.md."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]

# As avaliacoes classificam todas as fixtures pre-cutoff num unico processo Node.
# Com a reconstrucao holy e a deteccao de BM em 2 passes ativas, o acumulo de
# memoria estoura o heap padrao do V8 (~4 GB). 8 GB cobrem a varredura completa.
NODE = ["node", "--max-old-space-size=8192"]


if __name__ == "__main__":
    subprocess.run(
        NODE + ["tools/unified-experimental.mjs", "--gabarito"],
        cwd=ROOT,
        check=True,
    )
    # Varredura exaustiva de invariantes mecanicos (M-024/M-025 cross-turno,
    # cardinalidade, T-006, rotulos concretos) sobre todas as fixtures
    # pre-2026-06-16, nao so os turnos nomeados do gabarito.
    subprocess.run(
        NODE + ["tools/unified-experimental.mjs", "--invariants"],
        cwd=ROOT,
        check=True,
    )
