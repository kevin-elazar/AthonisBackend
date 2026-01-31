-- ==========================================
-- DADOS FICTÍCIOS PARA SISTEMA DE LOGÍSTICA
-- ==========================================
-- id_company: -1 = empresa padrão desenvolvimento
-- ==========================================

-- Limpar dados existentes (opcional - descomente se necessário)
-- DELETE FROM `order`;
-- DELETE FROM vehicle;
-- DELETE FROM driver;
-- DELETE FROM client;

-- ==========================================
-- INSERÇÃO DE USUÁRIO ADMIN
-- ==========================================

INSERT INTO user (id_company, email, password, name, role, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'admin@athonis.com', 'admin123', 'Admin', 'admin', datetime('now'), 'sistema', datetime('now'), 'sistema');

-- ==========================================
-- INSERÇÃO DE CLIENTES (5 clientes)
-- ==========================================

INSERT INTO client (id_company, name, trade_name, document, state_registration, email, phone, type, street, neighborhood, city, state, zip_code, number, complement, notes, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'João Silva Santos', 'Silva Comércio', '12345678000195', '123456789', 'joao.silva@email.com', '(11) 99999-1111', 'J', 'Rua das Flores', 'Centro', 'São Paulo', 'SP', '01234-567', '123', 'Sala 101', 'Cliente preferencial', datetime('now'), 'sistema', datetime('now'), 'sistema');

INSERT INTO client (id_company, name, trade_name, document, state_registration, email, phone, type, street, neighborhood, city, state, zip_code, number, complement, notes, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'Maria Oliveira Costa', NULL, '98765432100', NULL, 'maria.oliveira@email.com', '(11) 98888-2222', 'F', 'Avenida Paulista', 'Bela Vista', 'São Paulo', 'SP', '01310-100', '456', NULL, 'Entrega preferencial manhã', datetime('now'), 'sistema', datetime('now'), 'sistema');

INSERT INTO client (id_company, name, trade_name, document, state_registration, email, phone, type, street, neighborhood, city, state, zip_code, number, complement, notes, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'Empresa ABC Ltda', 'ABC Distribuidora', '11223344000166', '987654321', 'contato@abc.com.br', '(11) 97777-3333', 'J', 'Rua Augusta', 'Consolação', 'São Paulo', 'SP', '01305-000', '789', '12º andar', 'Horário comercial apenas', datetime('now'), 'sistema', datetime('now'), 'sistema');

INSERT INTO client (id_company, name, trade_name, document, state_registration, email, phone, type, street, neighborhood, city, state, zip_code, number, complement, notes, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'Carlos Eduardo Pereira', NULL, '55566677788', NULL, 'carlos.pereira@email.com', '(11) 96666-4444', 'F', 'Rua Oscar Freire', 'Jardins', 'São Paulo', 'SP', '01426-001', '321', 'Apto 45', NULL, datetime('now'), 'sistema', datetime('now'), 'sistema');

INSERT INTO client (id_company, name, trade_name, document, state_registration, email, phone, type, street, neighborhood, city, state, zip_code, number, complement, notes, created_at, created_by, updated_at, updated_by) VALUES
(-1, 'Distribuidora XYZ S/A', 'XYZ Logística', '99887766000144', '456789123', 'vendas@xyz.com.br', '(11) 95555-5555', 'J', 'Rua da Consolação', 'Centro', 'São Paulo', 'SP', '01302-000', '654', 'Conjunto 200', 'Entrega urgente - cliente VIP', datetime('now'), 'sistema', datetime('now'), 'sistema');

-- ==========================================
-- INSERÇÃO DE MOTORISTAS (3 motoristas)
-- ==========================================

INSERT INTO driver (id_company, name, gender, birth_date, document) VALUES
(-1, 'Pedro Henrique Santos', 'M', '1985-03-15', '12345678901');

INSERT INTO driver (id_company, name, gender, birth_date, document) VALUES
(-1, 'Ana Paula Rodrigues', 'F', '1990-07-22', '98765432109');

INSERT INTO driver (id_company, name, gender, birth_date, document) VALUES
(-1, 'Roberto Carlos Silva', 'M', '1982-11-08', '45678912345');

-- ==========================================
-- INSERÇÃO DE VEÍCULOS (3 veículos)
-- ==========================================

INSERT INTO vehicle (id_company, name, brand, model, year) VALUES
(-1, 'Van de Entregas 001', 'Mercedes-Benz', 'Sprinter', 2022);

INSERT INTO vehicle (id_company, name, brand, model, year) VALUES
(-1, 'Caminhão Médio 002', 'Volkswagen', 'Delivery', 2021);

INSERT INTO vehicle (id_company, name, brand, model, year) VALUES
(-1, 'Van Pequena 003', 'Ford', 'Transit', 2023);

-- ==========================================
-- INSERÇÃO DE PEDIDOS (5 pedidos)
-- ==========================================

INSERT INTO `order` (id_company, client_id, title, description, invoice_number, urgency, vehicle_id, driver_id, quantity, delivery_street, delivery_district, delivery_city, delivery_state, delivery_zipcode, delivery_number, delivery_complement) VALUES
(-1, 1, 'Entrega de Produtos Eletrônicos', 'Entrega de equipamentos de informática para escritório', 'NF-2024-001', 'normal', 1, 1, 15, 'Rua das Flores', 'Centro', 'São Paulo', 'SP', '01234-567', '123', 'Sala 101');

INSERT INTO `order` (id_company, client_id, title, description, invoice_number, urgency, vehicle_id, driver_id, quantity, delivery_street, delivery_district, delivery_city, delivery_state, delivery_zipcode, delivery_number, delivery_complement) VALUES
(-1, 2, 'Entrega Urgente - Documentos', 'Entrega de documentos importantes para assinatura', 'NF-2024-002', 'urgente', 3, 2, 1, 'Avenida Paulista', 'Bela Vista', 'São Paulo', 'SP', '01310-100', '456', NULL);

INSERT INTO `order` (id_company, client_id, title, description, invoice_number, urgency, vehicle_id, driver_id, quantity, delivery_street, delivery_district, delivery_city, delivery_state, delivery_zipcode, delivery_number, delivery_complement) VALUES
(-1, 3, 'Carga de Mercadorias Diversas', 'Entrega de produtos diversos para distribuidora', 'NF-2024-003', 'normal', 2, 3, 50, 'Rua Augusta', 'Consolação', 'São Paulo', 'SP', '01305-000', '789', '12º andar');

INSERT INTO `order` (id_company, client_id, title, description, invoice_number, urgency, vehicle_id, driver_id, quantity, delivery_street, delivery_district, delivery_city, delivery_state, delivery_zipcode, delivery_number, delivery_complement) VALUES
(-1, 4, 'Entrega Residencial', 'Entrega de produtos para cliente residencial', 'NF-2024-004', 'baixa', 1, 1, 8, 'Rua Oscar Freire', 'Jardins', 'São Paulo', 'SP', '01426-001', '321', 'Apto 45');

INSERT INTO `order` (id_company, client_id, title, description, invoice_number, urgency, vehicle_id, driver_id, quantity, delivery_street, delivery_district, delivery_city, delivery_state, delivery_zipcode, delivery_number, delivery_complement) VALUES
(-1, 5, 'Entrega VIP - Prioridade Máxima', 'Entrega especial para cliente VIP com urgência', 'NF-2024-005', 'urgente', 2, 2, 25, 'Rua da Consolação', 'Centro', 'São Paulo', 'SP', '01302-000', '654', 'Conjunto 200');

-- ==========================================
-- COMANDOS DE VERIFICAÇÃO
-- ==========================================

-- Verificar contagem de registros
SELECT 'Clientes' as Tabela, COUNT(*) as Total FROM client;
SELECT 'Motoristas' as Tabela, COUNT(*) as Total FROM driver;
SELECT 'Veículos' as Tabela, COUNT(*) as Total FROM vehicle;
SELECT 'Pedidos' as Tabela, COUNT(*) as Total FROM `order`;

-- Verificar dados dos clientes
SELECT client_id, name, trade_name, type, city, state FROM client ORDER BY client_id;

-- Verificar dados dos motoristas
SELECT driver_id, name, gender, document FROM driver ORDER BY driver_id;

-- Verificar dados dos veículos
SELECT vehicle_id, name, brand, model, year FROM vehicle ORDER BY vehicle_id;

-- Verificar dados dos pedidos
SELECT order_id, client_id, title, urgency, vehicle_id, driver_id, quantity, delivery_city FROM `order` ORDER BY order_id;

-- Verificar pedidos com informações completas
SELECT 
    o.order_id,
    o.title,
    o.urgency,
    c.name as cliente,
    d.name as motorista,
    v.name as veiculo,
    o.delivery_city,
    o.delivery_district,
    o.quantity
FROM `order` o
LEFT JOIN client c ON o.client_id = c.client_id
LEFT JOIN driver d ON o.driver_id = d.driver_id
LEFT JOIN vehicle v ON o.vehicle_id = v.vehicle_id
ORDER BY o.order_id;
