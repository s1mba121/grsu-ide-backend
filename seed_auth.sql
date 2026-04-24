--
-- PostgreSQL database dump
--

\restrict fxf7HFF5MAFOup4gdffYThxiuKQrUHeHBMMmIN3lcfEXxr7eQlZhAh12WRyrhHm

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: grsu
--

INSERT INTO public._prisma_migrations VALUES ('27b51748-7d47-444c-a79d-a76ed80d6f0d', '683d79575a5360db546dee8053e93a43cf33ed3cc3da13b1c86c709d7f79b309', '2026-04-10 14:24:13.89347+00', '20260406195632_init', NULL, NULL, '2026-04-10 14:24:13.856358+00', 1);


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: grsu
--

INSERT INTO public.groups VALUES ('7d326134-a927-45f4-b9ea-021ac3f84c9d', 'СДП-ПИ-242', '2026-04-10 18:31:56.202');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: grsu
--

INSERT INTO public.users VALUES ('4303fe43-43d4-418d-ade7-2acd60ab5cb6', 'test@example.com', 'Test User', '$2a$12$c3mtTFkEXErEvGJlH.Vhv.nFlPmXyApdgIbbdbRGisSVO0wD9lUvi', 'student', NULL, '2026-04-10 14:39:36.74');
INSERT INTO public.users VALUES ('944477b0-6ae8-41ba-a81a-43b1c64fb554', 'teacher@grsu.by', 'Teacher', '$2b$10$iFHYehiSvl1hSI0mwJMTJuY6TcHQjKwZ7wcMExaMPHF0WN9v2U.Ju', 'teacher', '7d326134-a927-45f4-b9ea-021ac3f84c9d', '2026-04-10 18:32:09.332');
INSERT INTO public.users VALUES ('e0532566-9b87-43fc-b7bb-4869aca83b52', 'skers_ne_24@student.grsu.by', 'Скерсь Никита', '$2a$12$5ytjvrJMwlDXN.whLKQnE.hbdFNCduNIqRVgIzfpYdf1Lh1OyQjxG', 'student', '7d326134-a927-45f4-b9ea-021ac3f84c9d', '2026-04-10 23:27:52.665');
INSERT INTO public.users VALUES ('09a88a36-0773-4a36-8993-d26a2bb7eeec', 'sianko_aa_24@student.grsu.by', 'Сенько Альберт', '$2a$12$/mO21v2RsjCGlWh/2NzLpeJv2.1qc21T6iUQn3i5NuY6fr.fKSKFy', 'student', '7d326134-a927-45f4-b9ea-021ac3f84c9d', '2026-04-23 11:11:16.212');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: grsu
--

INSERT INTO public.refresh_tokens VALUES ('17a86372-68f0-40ca-b74e-0a6d386be61b', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'a1c51cec2b3e8683ce0329e479fb6b3adb60b5117714e1c57da45dc6e87a3b6d', '2026-04-22 12:51:14.197', '2026-04-15 12:51:14.199');
INSERT INTO public.refresh_tokens VALUES ('b16da58f-d6d3-4452-a095-a2a7db8d98c0', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '2d4709929df476cb30180a343834a5b2506f168ccfc7ebf9add6585340fa7977', '2026-04-22 12:55:15.076', '2026-04-15 12:55:15.077');
INSERT INTO public.refresh_tokens VALUES ('4f5a0515-9847-4e94-8447-62d77df6a943', '944477b0-6ae8-41ba-a81a-43b1c64fb554', '0aad577de9b5f0354ba6ac1b7ebf63411218cd7ca227275e9c561ec934d414ac', '2026-04-17 23:22:04.903', '2026-04-10 23:22:04.905');
INSERT INTO public.refresh_tokens VALUES ('38258f98-f392-4037-a436-879620cea49d', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '9f6d781930789b279581e90bd2ef6c324de1b77a17e5cf0e3117a742b0d66b7c', '2026-04-18 21:10:54.59', '2026-04-11 21:10:54.593');
INSERT INTO public.refresh_tokens VALUES ('ced5eca0-dd6b-4793-900b-b27dc29da0dc', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '117168c4e2d45f5cf3b5fe4efb50c71707135756782d3e4242731bfc31c7cab5', '2026-04-18 21:55:55.901', '2026-04-11 21:55:55.902');
INSERT INTO public.refresh_tokens VALUES ('6d7daada-d35f-4bbe-8b8f-780d3a135968', 'e0532566-9b87-43fc-b7bb-4869aca83b52', 'e82234f77461e4000387e7caf0cfc045bfca850f7e7ee6bffa33b606d3a99449', '2026-04-18 22:00:25.652', '2026-04-11 22:00:25.655');
INSERT INTO public.refresh_tokens VALUES ('7e705a1e-26f2-4f4d-b177-0e92e6b62e3b', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '83e4d8e78bcedfc3d99e3a0f95a146585a88134dd3c503a1100f27c3c70acab4', '2026-04-18 22:14:12.5', '2026-04-11 22:14:12.502');
INSERT INTO public.refresh_tokens VALUES ('9f1a2df4-c32a-448c-bcd1-c070f2a4a6cb', '09a88a36-0773-4a36-8993-d26a2bb7eeec', '82dc6920c3cc6bcf6a829d24f7df46b80fa958f50b85cdffbb8f4795bfacb79b', '2026-04-30 12:27:19.748', '2026-04-23 12:27:19.749');
INSERT INTO public.refresh_tokens VALUES ('dfb8ea91-f88d-49c8-980f-f8dce6a93909', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '732e5d93e64bcaeb5d4483dec91ba1000f89dfdbe47c67afeede37813d29d089', '2026-04-30 12:27:36.548', '2026-04-23 12:27:36.55');
INSERT INTO public.refresh_tokens VALUES ('cf293a9a-ea4a-4867-a744-2b2d896f83bd', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'f7740175ec761d595d8a68ad188cb368782137d95cd1b475dae48a9d3ae0d24d', '2026-04-19 11:17:30.234', '2026-04-12 11:17:30.236');
INSERT INTO public.refresh_tokens VALUES ('d0ed62ea-25af-4ffe-aab9-a02e2e7f51af', 'e0532566-9b87-43fc-b7bb-4869aca83b52', 'cad0e7ef1c72f1204d422eb0bc6adb2d0b838796aeed60a9738fbe7b98e11c5f', '2026-04-19 11:17:40.346', '2026-04-12 11:17:40.347');
INSERT INTO public.refresh_tokens VALUES ('e852e722-fb25-4787-82b4-c468d77025d9', 'e0532566-9b87-43fc-b7bb-4869aca83b52', 'd427eacdea015af6b7c117d8e8e4e9b916a67542170a17081a4be7f017a5a1ac', '2026-04-19 11:19:19.759', '2026-04-12 11:19:19.76');
INSERT INTO public.refresh_tokens VALUES ('e0553e80-dcc9-4141-88a9-49b625d9c05c', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'feadd55a2952aee986669076669ac889557d162a261842c9925791cc0cdd8af5', '2026-04-19 11:19:27.973', '2026-04-12 11:19:27.974');
INSERT INTO public.refresh_tokens VALUES ('588c0d4d-3112-4238-a6d9-d3f5d5aa1dc0', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'afb13624f109501b44e7746fe72186366bf42b3af80e42a81406ba3f606bdde4', '2026-04-19 13:37:17.826', '2026-04-12 13:37:17.832');
INSERT INTO public.refresh_tokens VALUES ('7ab45b55-2f6f-4fa9-81aa-a29404701f73', 'e0532566-9b87-43fc-b7bb-4869aca83b52', '417b66d371c2da99f9bfd6422be7aeec8858969acce798ebc945e82dc9075736', '2026-04-19 19:41:18.577', '2026-04-12 19:41:18.579');
INSERT INTO public.refresh_tokens VALUES ('067e7195-f7b1-4d35-b8f7-44dfb0168010', 'e0532566-9b87-43fc-b7bb-4869aca83b52', 'd013b2ab4ad12a5ff43cf2675d94a43f124be82d145939ce57e5b870b7bab0e6', '2026-04-19 20:10:19.101', '2026-04-12 20:10:19.103');
INSERT INTO public.refresh_tokens VALUES ('9239b4b6-4889-456e-8741-65900b1c730e', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'a9f54c88888123c47404f34734587731cca85d49dd08fa55066e83bb2f4a0501', '2026-04-19 20:15:05.762', '2026-04-12 20:15:05.763');
INSERT INTO public.refresh_tokens VALUES ('e7b96bb6-ac72-4c32-8461-79253d4a7032', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'b54c8442b0f1188031f6923c79f83ff4f765c5a5b46e115eea92d2c8d8361d55', '2026-04-20 10:14:31.573', '2026-04-13 10:14:31.574');
INSERT INTO public.refresh_tokens VALUES ('344f92cb-3b5a-4c7e-8ed5-41790f7ba9d5', 'e0532566-9b87-43fc-b7bb-4869aca83b52', 'ab29ce3e3d9cc30308729655d482a401c10541871b23fa765970e1ca7f7c5fbf', '2026-04-20 12:45:17.062', '2026-04-13 12:45:17.063');
INSERT INTO public.refresh_tokens VALUES ('4721c1be-ab9d-467d-9ea2-f0a5e35a499e', '944477b0-6ae8-41ba-a81a-43b1c64fb554', 'ff597581b907e81e38eb332bc5bf1115157289f163dcfaea85c5f42eb6e15062', '2026-04-20 14:25:54.823', '2026-04-13 14:25:54.825');


--
-- PostgreSQL database dump complete
--

\unrestrict fxf7HFF5MAFOup4gdffYThxiuKQrUHeHBMMmIN3lcfEXxr7eQlZhAh12WRyrhHm

