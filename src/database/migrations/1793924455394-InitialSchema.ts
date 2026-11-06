import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793924455394 implements MigrationInterface {
  name = "InitialSchema1793924455394";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "vehicle" ("vehicle_id" SERIAL NOT NULL, "id_company" integer NOT NULL, "name" character varying(100) NOT NULL, "brand" character varying(50), "model" character varying(50), "year" integer, "plate" character varying(10), "type" character varying(20) NOT NULL DEFAULT 'van', "capacity_kg" integer, "status" character varying(20) NOT NULL DEFAULT 'available', "driver_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_8b107f0822abfa70997e54a0a61" PRIMARY KEY ("vehicle_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "client" ("client_id" SERIAL NOT NULL, "id_company" integer NOT NULL, "name" character varying(100) NOT NULL, "trade_name" character varying(100), "document" character varying(18) NOT NULL, "state_registration" character varying(20), "email" character varying(100), "phone" character varying(20), "type" character varying(1) NOT NULL, "birth_date" date, "street" character varying(100) NOT NULL, "neighborhood" character varying(100) NOT NULL, "city" character varying(100) NOT NULL, "state" character varying(2) NOT NULL, "zip_code" character varying(10) NOT NULL, "number" character varying(10) NOT NULL, "complement" character varying(100), "latitude" double precision, "longitude" double precision, "geocoded_address" character varying(400), "notes" text, "status" character varying(20) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_7510ce0a84bde51dbff978b4b49" PRIMARY KEY ("client_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver" ("driver_id" SERIAL NOT NULL, "id_company" integer NOT NULL, "name" character varying(100) NOT NULL, "gender" character varying(20), "birth_date" date, "document" character varying(14), "phone" character varying(20), "cnh" character varying(20), "cnh_category" character varying(2), "cnh_expiration" date, "status" character varying(20) NOT NULL DEFAULT 'available', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_f27607c5716c6afcef0eb6aa1b0" PRIMARY KEY ("driver_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "route" ("route_id" SERIAL NOT NULL, "id_company" integer NOT NULL, "history_id" integer, "driver_id" integer, "vehicle_id" integer, "status" character varying(20) NOT NULL DEFAULT 'planned', "planned_date" date, "total_distance_m" integer, "total_duration_min" integer, "simulated" boolean NOT NULL DEFAULT false, "duplicated_from_route_id" integer, "region" character varying(100), "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_4e7fe1b2d0ef419d4ce018aa0b5" PRIMARY KEY ("route_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order" ("order_id" SERIAL NOT NULL, "id_company" integer NOT NULL, "client_id" integer, "title" character varying(100) NOT NULL, "description" text, "invoice_number" character varying(50), "urgency" character varying(20) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "delivery_window" character varying(30), "value" numeric(12,2), "route_id" integer, "stop_sequence" integer, "delivery_latitude" double precision, "delivery_longitude" double precision, "delivery_geocoded_address" character varying(400), "delivered_at" TIMESTAMP WITH TIME ZONE, "vehicle_id" integer, "driver_id" integer, "delivery_date" date, "quantity" integer NOT NULL, "delivery_street" character varying(100) NOT NULL, "delivery_district" character varying(100) NOT NULL, "delivery_city" character varying(100) NOT NULL, "delivery_state" character varying(2) NOT NULL, "delivery_zipcode" character varying(10) NOT NULL, "delivery_number" character varying(10) NOT NULL, "delivery_complement" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_58998c5eaeaacdd004dec8b5d86" PRIMARY KEY ("order_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "street_view_cache" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "order_id" integer NOT NULL, "address" character varying(500) NOT NULL, "status" character varying(50) NOT NULL, "pano_id" character varying(100), "latitude" numeric(10,7), "longitude" numeric(10,7), "capture_date" character varying(20), "image_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "UQ_c592b0f2cb89b841e1026b55cef" UNIQUE ("id_company", "order_id"), CONSTRAINT "REL_a252aa1e5b9ac9a16728587bb7" UNIQUE ("order_id"), CONSTRAINT "PK_bb3b681bac9befd8cfe68b726a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "email" character varying(100) NOT NULL, "password" character varying(255) NOT NULL, "name" character varying(100) NOT NULL, "role" character varying(50) NOT NULL DEFAULT 'user', "id_company" integer NOT NULL, "driver_id" integer, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), "last_login" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "route_returned_stop" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "route_id" integer NOT NULL, "order_id" integer NOT NULL, "stop_sequence" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c60df4625529648138cd174c791" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd3dc86da6c357951d19a9fbbd" ON "route_returned_stop" ("route_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "route_location_ping" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "route_id" integer NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "accuracy_m" double precision, "speed_mps" double precision, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "client_ping_id" character varying(64) NOT NULL, CONSTRAINT "PK_1fe038363b8dcf9de4315e8d149" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9f6ec6d7ca4ab8745c76a45671" ON "route_location_ping" ("route_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3305c4a7c0ebca657c503d52f1" ON "route_location_ping" ("id_company", "client_ping_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "route_execution_metrics" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "route_id" integer NOT NULL, "driver_id" integer, "planned_distance_m" integer, "actual_distance_m" integer, "planned_duration_min" integer, "actual_duration_min" integer, "stops_total" integer NOT NULL DEFAULT '0', "stops_delivered" integer NOT NULL DEFAULT '0', "stops_failed" integer NOT NULL DEFAULT '0', "stops_out_of_order" integer NOT NULL DEFAULT '0', "idle_time_min" integer, "avg_service_min" double precision, "avg_delay_min" double precision, "ping_count" integer NOT NULL DEFAULT '0', "stops" text, "computed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_7af0a829ce3b2c8b37f58bc97ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9b8c6cdc9937f983acf541f19e" ON "route_execution_metrics" ("route_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "route_event" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "route_id" integer NOT NULL, "order_id" integer, "driver_id" integer, "type" character varying(20) NOT NULL, "occurrence_type" character varying(30), "notes" text, "latitude" double precision, "longitude" double precision, "accuracy_m" double precision, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "client_event_id" character varying(64) NOT NULL, CONSTRAINT "PK_71f2e1858117ffff5f16c74452a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_49aeefa9789a5386a24532fcaa" ON "route_event" ("route_id", "occurred_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_864baddc32c59003cc718e6bc5" ON "route_event" ("id_company", "client_event_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_token" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "replaced_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "device" character varying(120), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6bbe63d2fe75e7f0ba1710351d" ON "refresh_token" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f0812282fad2e352cdaf83ef0a" ON "refresh_token" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "optimized_route_history" ("id" SERIAL NOT NULL, "id_company" integer NOT NULL, "order_ids" text NOT NULL, "total_routes" integer NOT NULL, "total_orders" integer NOT NULL, "optimization_time_ms" integer, "google_api_response" text NOT NULL, "optimization_result" text NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'success', "notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_40562a44f02e93b8e5f51558ff0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "geocode_cache" ("id" SERIAL NOT NULL, "address_key" character varying(400) NOT NULL, "formatted_address" character varying(400), "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "provider" character varying(20) NOT NULL DEFAULT 'google', "hits" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8ec4e0cc65e2fdeed1fda4fbdc8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_00b9dc2faa940c1d8ad9f102f2" ON "geocode_cache" ("address_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "company" ("id_company" integer NOT NULL, "corporate_name" character varying(150) NOT NULL, "trade_name" character varying(100), "document" character varying(18) NOT NULL, "state_registration" character varying(20), "municipal_registration" character varying(20), "email" character varying(100), "phone" character varying(20), "website" character varying(150), "depot_street" character varying(100), "depot_number" character varying(10), "depot_complement" character varying(100), "depot_district" character varying(100), "depot_city" character varying(100), "depot_state" character varying(2), "depot_zip_code" character varying(10), "depot_latitude" numeric(10,7), "depot_longitude" numeric(10,7), "depot_geocoded_address" character varying(400), "cost_per_km" numeric(10,2) NOT NULL DEFAULT '1', "cost_per_hour" numeric(10,2) NOT NULL DEFAULT '50', "stop_duration_minutes" integer NOT NULL DEFAULT '30', "default_vehicle_capacity_kg" integer NOT NULL DEFAULT '1000', "operation_start_time" character varying(5), "operation_end_time" character varying(5), "logo_url" character varying(300), "timezone" character varying(40) NOT NULL DEFAULT 'America/Sao_Paulo', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_by" character varying(50), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(50), CONSTRAINT "PK_3cfb3efea34454bc843324000db" PRIMARY KEY ("id_company"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "route" ADD CONSTRAINT "FK_c1310391be01ff2e8a4ca461325" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "route" ADD CONSTRAINT "FK_3d44318393c5e24882bd5bf433b" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_a0d9cbb7f4a017bac3198dd8ca0" FOREIGN KEY ("client_id") REFERENCES "client"("client_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_e7dd767e1bff2d6d8cf6e978b50" FOREIGN KEY ("route_id") REFERENCES "route"("route_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_74ef9e828c4d521e413a5230682" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_71e6299877e37f03f2a00527fff" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "street_view_cache" ADD CONSTRAINT "FK_a252aa1e5b9ac9a16728587bb79" FOREIGN KEY ("order_id") REFERENCES "order"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "street_view_cache" DROP CONSTRAINT "FK_a252aa1e5b9ac9a16728587bb79"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_71e6299877e37f03f2a00527fff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_74ef9e828c4d521e413a5230682"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_e7dd767e1bff2d6d8cf6e978b50"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_a0d9cbb7f4a017bac3198dd8ca0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "route" DROP CONSTRAINT "FK_3d44318393c5e24882bd5bf433b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "route" DROP CONSTRAINT "FK_c1310391be01ff2e8a4ca461325"`,
    );
    await queryRunner.query(`DROP TABLE "company"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_00b9dc2faa940c1d8ad9f102f2"`,
    );
    await queryRunner.query(`DROP TABLE "geocode_cache"`);
    await queryRunner.query(`DROP TABLE "optimized_route_history"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0812282fad2e352cdaf83ef0a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6bbe63d2fe75e7f0ba1710351d"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_token"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_864baddc32c59003cc718e6bc5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_49aeefa9789a5386a24532fcaa"`,
    );
    await queryRunner.query(`DROP TABLE "route_event"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9b8c6cdc9937f983acf541f19e"`,
    );
    await queryRunner.query(`DROP TABLE "route_execution_metrics"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3305c4a7c0ebca657c503d52f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9f6ec6d7ca4ab8745c76a45671"`,
    );
    await queryRunner.query(`DROP TABLE "route_location_ping"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd3dc86da6c357951d19a9fbbd"`,
    );
    await queryRunner.query(`DROP TABLE "route_returned_stop"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "street_view_cache"`);
    await queryRunner.query(`DROP TABLE "order"`);
    await queryRunner.query(`DROP TABLE "route"`);
    await queryRunner.query(`DROP TABLE "driver"`);
    await queryRunner.query(`DROP TABLE "client"`);
    await queryRunner.query(`DROP TABLE "vehicle"`);
  }
}
