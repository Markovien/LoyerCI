# Benchmark des fournisseurs SMS en Côte d'Ivoire (24/11/2026)

> Objet : choisir le fournisseur des SMS de LoyerCI. Usages prévus : D.3 (SMS « document disponible » avec
> lien de téléchargement protégé par code) et P3.1 (code de connexion du compte locataire). **Les deux
> restent en suspens** jusqu'au choix (décision du 24/11/2026) ; la connexion se fait par lien magique
> envoyé par e-mail.

## 1. Avertissement sur les prix

Les tarifs publics trouvés sont **disparates et souvent anciens** : plusieurs pages ont plus d'un an,
certaines plus de trois ans, et deux pages d'Orange elles-mêmes se contredisent. L'écart dépend aussi du type
d'expéditeur (local ou étranger), du réseau destinataire et du volume. Ces chiffres servent à **comparer des
ordres de grandeur**. Ils ne remplacent pas un devis : demander une offre écrite avant de budgéter.

## 2. Comparatif

| Fournisseur | Type | Prix indicatif / SMS | Points forts | Points faibles |
|---|---|---|---|---|
| **Orange SMS API Côte d'Ivoire** (developer.orange.com) | Opérateur, API officielle | Forfaits de 7,3 à 16 FCFA selon la page consultée ; jusqu'à 10 FCFA en gros volume | Officiel ; paiement en crédit ou Orange Money ; nom d'expéditeur personnalisé gratuit (après validation par l'équipe locale) ; seule la consommation est facturée | Grilles contradictoires entre deux pages ; limite de 5 envois/s ; délivrabilité vers MTN et Moov à vérifier ; démarches auprès de l'équipe locale |
| **proSMS** (afruxia) | Agrégateur local | 15 FCFA (< 50 000/mois), 12 FCFA, 10 FCFA (> 100 000) | Tous réseaux annoncés ; point d'API OTP intégré (code 5 min, 3 essais) | Acteur peu connu : solidité et SLA à vérifier |
| **HSMS** (hsms.ci) | Agrégateur local | 12 à 17 FCFA (packs de 150 à 10 000 SMS, valables 365 jours) | Intégration API sans frais ; packs prépayés | Idem : SLA, support, conformité à vérifier |
| **Twilio** | International | 0,4925 $ ≈ 300 FCFA (page officielle) | Intégration native à Supabase Auth ; très fiable ; documentation | **20 à 30 fois plus cher** ; expéditeur alphanumérique à enregistrer (expéditeur numérique refusé) |
| **Infobip** | International | ≈ 0,26 € ≈ 170 FCFA | Présence africaine, accords opérateurs | Cher pour notre volume |
| **Plivo, SMSPM, Unimatrix, BulkGate…** | International | 0,10 à 0,50 $ selon le réseau | Mise en route rapide | Chers ; acheminement international, délivrabilité variable |

Africa's Talking et Brevo : aucun tarif public pour la Côte d'Ivoire trouvé dans les sources consultées.

## 3. Ce que cela coûte à LoyerCI

Hypothèse : 3 SMS par locataire et par mois (avis disponible, quittance disponible, un code).

| Prix unitaire | Coût / locataire / mois | 1 000 locataires / mois |
|---|---|---|
| 12 FCFA (local) | 36 FCFA | 36 000 FCFA |
| 170 FCFA (Infobip) | 510 FCFA | 510 000 FCFA |
| 300 FCFA (Twilio) | 900 FCFA | 900 000 FCFA |

Ces frais sont à la charge du bailleur et inclus dans l'abonnement (décision du 21/11/2026). **Seul un
fournisseur local est compatible** avec un abonnement abordable.

## 4. Contraintes communes

- **Nom d'expéditeur** (ex. `LOYERCI`, 11 caractères au plus) : à faire valider (par l'opérateur ou via le
  fournisseur). Les expéditeurs dynamiques non enregistrés sont refusés en Côte d'Ivoire selon un guide tiers.
  Prévoir plusieurs semaines.
- **Intégration à Supabase Auth** : Twilio, MessageBird, Vonage et Textlocal sont branchés nativement. Pour
  un fournisseur local, passer par le **crochet d'envoi de SMS** (« Send SMS Hook ») de Supabase Auth : une
  fonction qui reçoit le code et l'envoie par l'API du fournisseur. C'est un peu plus de code, mais le
  fournisseur reste interchangeable.
- **Contenu** (invariant n° 9) : jamais de numéro de compte, de RIB ni de numéro Mobile Money dans un SMS ;
  uniquement le lien vers la page authentifiée ou le code.
- **Sécurité OTP** : code à 6 chiffres, durée de vie courte, nombre d'essais limité, quotas par numéro déjà
  en base (`message_events`, D.5).

## 5. Recommandation

1. **Présélectionner Orange SMS API Côte d'Ivoire** (officiel, moins cher, payable en Orange Money) **et un
   agrégateur local** (proSMS ou HSMS) qui couvre les trois réseaux.
2. **Test réel avant tout contrat** : 50 SMS vers des numéros Orange, MTN et Moov, en mesurant le taux et le
   délai de remise et la conservation du nom d'expéditeur.
3. Retenir le meilleur en délivrabilité sur **les trois réseaux**, le second servant de **secours**. Les deux
   passent derrière la même interface (`SmsProvider`), comme les fournisseurs de paiement.
4. Twilio seulement en dernier recours ou pour un secours très ponctuel.

Une fois le fournisseur choisi : D.3 puis P3.1 se branchent sur l'interface, et la demande de nom
d'expéditeur est lancée tout de suite (délai le plus long).

## Sources

- Orange, SMS Côte d'Ivoire (2.0) : https://developer.orange.com/apis/sms-ci/pricing · https://developer.orange.com/apis/sms-ci · https://developer.orange.com/apis/sms/getting-started
- proSMS (afruxia) : https://marketing.afruxia.com/
- HSMS : https://hsms.ci/
- Twilio, tarifs Côte d'Ivoire : https://www.twilio.com/en-us/sms/pricing/ci · règles pays : https://www.twilio.com/en-us/guidelines/ci/sms · expéditeur alphanumérique : https://help.twilio.com/articles/223133767-International-support-for-Alphanumeric-Sender-ID
- Infobip : https://www.infobip.com/sms/pricing
- Plivo : https://www.plivo.com/sms/pricing/ci/
- SMSPM : https://smspm.com/fr/country/envoyer-sms-cote-ivoire/
- Unimatrix : https://www.unimtx.com/sms/ci
- BulkGate : https://www.bulkgate.com/en/pricing/sms/ci/cote-d-ivoire/
- Comparatif tiers (à prendre avec prudence) : https://www.sent.dm/resources/sms-pricing/ivory-coast-sms-pricing · https://esmsafrica.io/sms-pricing
