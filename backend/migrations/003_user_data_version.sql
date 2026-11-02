-- Versionamento otimista do cenário salvo: cada PUT carrega a versão em que se
-- baseou; a gravação só acontece se a versão ainda for a mesma (conflito entre
-- abas/dispositivos vira 409 visível, nunca sobrescrita silenciosa).
-- Aditiva: nenhuma coluna/dado existente é alterado ou removido.
BEGIN;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
COMMIT;
