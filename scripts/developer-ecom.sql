CREATE TABLE IF NOT EXISTS pay_lab_developer_ecom (
 source text NOT NULL,id uuid NOT NULL,input jsonb NOT NULL,request jsonb NOT NULL,
 response jsonb,recovered_response jsonb,event jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),responded_at timestamptz,recovered_at timestamptz,received_at timestamptz,
 PRIMARY KEY(source,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pay_lab_developer_ecom_request ON pay_lab_developer_ecom(source,(request->>'requestKey'));
CREATE TABLE IF NOT EXISTS pay_lab_developer_receipts (
 source text NOT NULL,event_id text NOT NULL,example_id uuid NOT NULL,body_hash text NOT NULL,body text NOT NULL,headers jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source,event_id),
 FOREIGN KEY(source,example_id) REFERENCES pay_lab_developer_ecom(source,id)
);
