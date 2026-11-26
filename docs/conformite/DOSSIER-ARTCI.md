# Dossier ARTCI — préparation (P4.8)

> **Projet à faire valider par un juriste** avant dépôt. Établi d'après ce que le code stocke
> réellement au 26/11/2026 (migrations `supabase/migrations/`). Cadre : loi n° 2013-450 du
> 19 juin 2013 relative à la protection des données à caractère personnel ; autorité : ARTCI.
> Les champs « [À COMPLÉTER] » se reportent aussi dans `src/lib/legal.ts` (pages publiques).

## 1. Démarches

| Démarche | Pourquoi | État |
|---|---|---|
| Déclaration (ou demande d'autorisation) des traitements | Gestion locative, preuves de paiement, sécurité | À déposer |
| **Autorisation de transfert hors de Côte d'Ivoire** | Hébergement dans l'Union européenne (décision D3) ; sauvegardes chiffrées sur GitHub (États-Unis) ; application sur Vercel | À déposer (avant l'ouverture) |
| Désignation d'un correspondant à la protection des données | Point de contact des personnes et de l'ARTCI | [À COMPLÉTER] |
| Contrat de sous-traitance bailleur ↔ éditeur | Le bailleur est responsable des données de ses locataires ; l'éditeur traite pour son compte | À intégrer à l'abonnement |

## 2. Rôles

- **Bailleur** (propriétaire ou agence) : responsable du traitement des données de ses locataires.
- **Éditeur de LoyerCI** : sous-traitant pour ces données ; responsable du traitement pour les comptes utilisateurs et les données de sécurité (journal d'audit, limiteur de débit).

## 3. Registre des traitements

| Traitement | Personnes | Données | Base | Destinataires | Durée |
|---|---|---|---|---|---|
| Gestion du parc et des baux | Bailleurs, équipes, locataires | Nom, téléphone, e-mail (facultatif pour le locataire), bien, loyer, dates du bail | Exécution du bail et du contrat d'abonnement | Bailleur et équipe selon le rôle | Durée de la relation ; compte locataire supprimé 3 mois après le départ |
| Avis d'échéance et quittances signés | Locataires | Nom, bien, période, montants, référence, signature | Exécution du bail ; preuve du paiement | Bailleur, locataire ; tiers vérificateur (données masquées sur `/verify`) | **2 ans après émission** (décision du 24/11/2026), export proposé au bailleur 30 jours avant |
| Encaissements | Locataires | Montant, mode, opérateur, n° de transaction, numéro du payeur (lisible des seuls services du serveur ; 4 derniers chiffres affichés), preuve de virement | Exécution du bail | Propriétaire et comptable | Ligne de paiement : durée de la relation ; preuve : 2 ans ; données brutes des opérateurs : 90 jours |
| Envoi des documents par WhatsApp | Locataires | Numéro, accord (date) | **Consentement** | Bailleur (depuis son propre compte) | Jusqu'au retrait de l'accord |
| Notifications et relances par e-mail | Bailleurs, locataires ayant un e-mail | E-mail, nom, montant, période | Exécution du bail ; intérêt légitime | Prestataire d'envoi [À COMPLÉTER] | File d'envoi : 90 jours |
| Sécurité et preuve | Tous les utilisateurs | Adresse IP, navigateur, action, date (journal d'audit chaîné) ; clés hachées du limiteur | Intérêt légitime (sécurité, lutte contre la fraude) | Éditeur ; propriétaire pour son organisation | Journal : **voir point ouvert n° 1** ; limiteur : 1 jour |
| Sauvegardes | Tous | Copie chiffrée de la base | Intérêt légitime (continuité) | GitHub (chiffré, illisible sans la clé hors ligne) | 30 jours |

Données **non** collectées : pièce d'identité, données bancaires complètes du locataire, géolocalisation, données de mesure d'audience.

## 4. Sous-traitants et transferts

| Prestataire | Rôle | Localisation des données |
|---|---|---|
| Supabase | Base de données, authentification, fichiers | Union européenne |
| Vercel | Exécution de l'application | Région européenne (société américaine) |
| GitHub | Code source, intégration continue, **sauvegardes chiffrées** | États-Unis (contenu chiffré) |
| [Prestataire e-mail, À COMPLÉTER] | Envoi des notifications automatiques | À préciser |
| CinetPay (si activé ; désactivé par défaut) | Paiement en ligne | Côte d'Ivoire |
| Fournisseur SMS (D.3, en suspens) | SMS de disponibilité et codes | Voir `docs/BENCHMARK-SMS.md` |

## 5. Mesures de sécurité (résumé pour le dossier)

- Cloisonnement par organisation **en base** (RLS sur toutes les tables, aucune écriture directe depuis l'application, fonctions contrôlant le rôle à chaque opération) ; liste de contrôle automatisée à chaque livraison.
- Documents signés (HMAC-SHA256) et vérifiables ; journal d'audit chaîné (SHA-256), inaltérable même par l'administrateur applicatif, intégrité contrôlée chaque jour.
- Connexion par lien magique, inscription sur invitation seulement ; ré-authentification par code et délai de 48 h pour tout compte de réception des loyers.
- Chiffrement en transit (HTTPS, HSTS), CSP stricte, en-têtes de sécurité ; fichiers déposés contrôlés par leur contenu, stockage privé, accès par lien signé de 60 s.
- Minimisation : numéros masqués dans les messages et sur la page publique, aucune coordonnée de paiement dans un message, journaux techniques filtrés (e-mails, téléphones, IBAN masqués), purges automatiques.
- Sauvegardes quotidiennes chiffrées, restauration testée à chaque livraison.

## 6. Points ouverts (à trancher)

1. **Adresses IP du journal d'audit, conservées sans limite.** Elles font partie de l'empreinte chaînée : on ne peut pas les effacer après coup sans casser la preuve d'intégrité. Options : (a) les garder (justification : preuve et sécurité, à faire accepter par l'ARTCI) ; (b) n'enregistrer à l'avenir que le réseau (IP tronquée), moins précis pour une enquête. **Décision du porteur de projet requise.**
2. Prestataire d'envoi des e-mails et fournisseur SMS : à choisir puis ajouter aux sous-traitants.
3. Durée de conservation des lignes de paiement et des avis (hors documents) après la fin de la relation : aujourd'hui conservées ; à fixer avec le juriste.
4. Information des locataires par le bailleur : modèle de mention à fournir aux bailleurs (au moment de la saisie de la fiche locataire).
