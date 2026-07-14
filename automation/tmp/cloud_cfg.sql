--
-- PostgreSQL database dump
--

\restrict G6ed8RjiVsWc68ZjFILHdFkw5F7eYoa6KZBy3mExOcScdy7gxeLKq6pRA7nxMB7

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: model_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.model_settings (id, slot, model_name, api_base_url, api_key_encrypted, use_same_as_reasoning, check_status, last_checked_at, last_error_message, updated_at) FROM stdin;
3e1ab768-224c-4be0-9b01-b2561eee8a96	reasoning	mimo-v2.5	https://token-plan-cn.xiaomimimo.com/anthropic	tp-czo3njk0jrcq8ab9d4slv77kuk0h5e5krrxpwglqr1exxzrz	f	passed	2026-06-20 15:28:27.91+00	\N	2026-06-20 15:28:27.91+00
de82b3a5-e98d-45fd-a3d7-9bac16b911bb	deep	mimo-v2.5	https://token-plan-cn.xiaomimimo.com/anthropic	tp-czo3njk0jrcq8ab9d4slv77kuk0h5e5krrxpwglqr1exxzrz	f	passed	2026-06-20 15:28:33.108+00	\N	2026-06-20 15:28:33.108+00
d801eba2-b454-4625-a3c7-30003eca5074	vision	mimo-v2.5	https://token-plan-cn.xiaomimimo.com/anthropic	tp-czo3njk0jrcq8ab9d4slv77kuk0h5e5krrxpwglqr1exxzrz	f	passed	2026-06-20 15:28:35.71+00	\N	2026-06-20 15:28:35.71+00
293c8ea4-5810-42b0-9ee6-13858eb5a388	web	search_std	https://open.bigmodel.cn/api	2ce906884ec44ed8bea25e7fb0957e20.Y669JorTO8zfYfrB	f	passed	2026-06-20 15:28:38.495+00	\N	2026-06-20 15:28:38.495+00
704d566c-5201-42a7-94c0-b5c2a62ff412	embedding	embedding-3	https://open.bigmodel.cn/api/paas/v4	2ce906884ec44ed8bea25e7fb0957e20.Y669JorTO8zfYfrB	f	passed	2026-06-20 15:28:40.151+00	\N	2026-06-20 15:28:40.151+00
\.


--
-- Data for Name: scheduled_jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scheduled_jobs (id, job_type, enabled, schedule_kind, schedule_days, run_at_time, consecutive_failures, updated_at, last_run_at) FROM stdin;
54f3e724-01f8-4dcd-b4b2-cdcbe6b8d8f9	portfolio	f	weekly	{3}	09:00	0	2026-06-21 03:08:27.249+00	\N
\.


--
-- PostgreSQL database dump complete
--

\unrestrict G6ed8RjiVsWc68ZjFILHdFkw5F7eYoa6KZBy3mExOcScdy7gxeLKq6pRA7nxMB7

