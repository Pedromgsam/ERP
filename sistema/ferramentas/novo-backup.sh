#!/bin/sh
# Cria o próximo backup nomeado da pasta sistema/ (versão atual, já commitada).
# Uso: sh sistema/ferramentas/novo-backup.sh "Nome da alteração"
set -e
cd "$(dirname "$0")/../.."
mkdir -p backups
# próximo número = maior número já usado + 1 (backups antigos podem ter saído da pasta)
n=$(ls backups/ 2>/dev/null | sed -n 's/^Backup \([0-9]*\).*\.zip$/\1/p' | sort -n | tail -1)
n=$(( ${n:-0} + 1 ))
nome=$(echo "$1" | sed 's#[/\\:*?"<>|]#-#g')
arq=$(printf "backups/Backup %02d - %s.zip" "$n" "$nome")
git archive --format=zip -o "$arq" HEAD sistema
echo "criado: $arq"
