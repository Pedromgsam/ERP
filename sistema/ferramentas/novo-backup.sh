#!/bin/sh
# Cria o próximo backup nomeado da pasta sistema/ (versão atual, já commitada).
# Uso: sh sistema/ferramentas/novo-backup.sh "Nome da alteração"
set -e
cd "$(dirname "$0")/../.."
mkdir -p backups
n=$(ls backups/Backup\ *.zip 2>/dev/null | wc -l)
n=$((n + 1))
nome=$(echo "$1" | sed 's#[/\\:*?"<>|]#-#g')
arq=$(printf "backups/Backup %02d - %s.zip" "$n" "$nome")
git archive --format=zip -o "$arq" HEAD sistema
echo "criado: $arq"
