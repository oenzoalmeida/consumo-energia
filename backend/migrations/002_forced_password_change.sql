-- Troca de senha obrigatória no primeiro acesso + revogação de sessões por versão.
-- Aditiva: nenhuma coluna/dado existente é alterado ou removido.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;
COMMIT;
