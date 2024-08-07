PGDMP  "    %                |            AMS    16.1    16.1     �           0    0    ENCODING    ENCODING        SET client_encoding = 'UTF8';
                      false            �           0    0 
   STDSTRINGS 
   STDSTRINGS     (   SET standard_conforming_strings = 'on';
                      false            �           0    0 
   SEARCHPATH 
   SEARCHPATH     8   SELECT pg_catalog.set_config('search_path', '', false);
                      false            �           1262    16932    AMS    DATABASE     �   CREATE DATABASE "AMS" WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'English_United States.1252';
    DROP DATABASE "AMS";
                postgres    false            �            1259    16933    login    TABLE     �   CREATE TABLE public.login (
    id integer NOT NULL,
    name character(50),
    role character(50),
    password character(50),
    email character(50)
);
    DROP TABLE public.login;
       public         heap    postgres    false            �            1259    16964    record    TABLE     �   CREATE TABLE public.record (
    r_id integer NOT NULL,
    name character(50),
    "time" time without time zone,
    date date,
    type character(3),
    id integer NOT NULL,
    reason character(50)
);
    DROP TABLE public.record;
       public         heap    postgres    false            �            1259    16963    record_r_id_seq    SEQUENCE     �   CREATE SEQUENCE public.record_r_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 &   DROP SEQUENCE public.record_r_id_seq;
       public          postgres    false    217            �           0    0    record_r_id_seq    SEQUENCE OWNED BY     C   ALTER SEQUENCE public.record_r_id_seq OWNED BY public.record.r_id;
          public          postgres    false    216            U           2604    16967    record r_id    DEFAULT     j   ALTER TABLE ONLY public.record ALTER COLUMN r_id SET DEFAULT nextval('public.record_r_id_seq'::regclass);
 :   ALTER TABLE public.record ALTER COLUMN r_id DROP DEFAULT;
       public          postgres    false    216    217    217            �          0    16933    login 
   TABLE DATA           @   COPY public.login (id, name, role, password, email) FROM stdin;
    public          postgres    false    215   !       �          0    16964    record 
   TABLE DATA           L   COPY public.record (r_id, name, "time", date, type, id, reason) FROM stdin;
    public          postgres    false    217   �       �           0    0    record_r_id_seq    SEQUENCE SET     =   SELECT pg_catalog.setval('public.record_r_id_seq', 7, true);
          public          postgres    false    216            W           2606    16937    login login_pkey 
   CONSTRAINT     N   ALTER TABLE ONLY public.login
    ADD CONSTRAINT login_pkey PRIMARY KEY (id);
 :   ALTER TABLE ONLY public.login DROP CONSTRAINT login_pkey;
       public            postgres    false    215            Y           2606    16969    record record_pkey 
   CONSTRAINT     R   ALTER TABLE ONLY public.record
    ADD CONSTRAINT record_pkey PRIMARY KEY (r_id);
 <   ALTER TABLE ONLY public.record DROP CONSTRAINT record_pkey;
       public            postgres    false    217            Z           2606    16970 	   record id    FK CONSTRAINT     c   ALTER TABLE ONLY public.record
    ADD CONSTRAINT id FOREIGN KEY (id) REFERENCES public.login(id);
 3   ALTER TABLE ONLY public.record DROP CONSTRAINT id;
       public          postgres    false    4695    217    215            �   �   x���1�0Eg�>A�� v&V�u�HI�Ҕ^�p�Y���ׯ�N�=t����5�{`������3�=��M��~C�>ʲ�v�g{_���`�^��p)AP$[4>8M<�&q��s�9�mҕK��S�}=x���p�      �   �   x�����0@��W�0\iAo��AW�S�6�$b����D"��������!�/|��2x �2Mh@�J'�N� w���*������q��C_�5��Gh؍n[>ɍk����ٯ�Ҝt�i��Y뎵�w}��0���UE�vj���jޠ��d�[0�����_VE\�Ѥ�D�ܖ�U���	��a     