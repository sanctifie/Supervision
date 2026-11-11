#!/usr/bin/env python3
"""Agent de la supervision : vient chercher les jobs de ce serveur et les exécute.

Aucune dépendance (Python 3.6+), aucun port ouvert : l'agent appelle la supervision.
  SUPERVISION_URL=https://supervision.exemple.fr AGENT_JETON=... python3 agent.py
Lancez-le avec un compte dédié, sans droits root : il exécute ce que les
administrateurs de la supervision écrivent dans les jobs.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

URL = os.environ.get("SUPERVISION_URL", "").rstrip("/")
JETON = os.environ.get("AGENT_JETON", "")
PAUSE = int(os.environ.get("AGENT_PAUSE", "10"))
SORTIE_MAX = 16000


def appeler(chemin, corps):
    requete = urllib.request.Request(
        URL + "/api/agent/" + chemin,
        data=json.dumps(corps).encode(),
        headers={"content-type": "application/json", "authorization": "Bearer " + JETON},
    )
    with urllib.request.urlopen(requete, timeout=20) as reponse:
        return json.loads(reponse.read() or b"null")


def executer(travail):
    try:
        p = subprocess.run(
            ["sh", "-c", travail["commande"]],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=travail["delaiMax"],
        )
        return p.returncode, p.stdout.decode(errors="replace")
    except subprocess.TimeoutExpired as e:
        return 124, (e.stdout or b"").decode(errors="replace") + "\n[agent] durée maximale dépassée, commande arrêtée"
    except Exception as e:  # la commande n'a pas pu démarrer
        return 127, "[agent] " + str(e)


def main():
    if not URL or not JETON:
        sys.exit("SUPERVISION_URL et AGENT_JETON sont obligatoires")
    print("[agent] à l'écoute de", URL, flush=True)
    while True:
        try:
            travail = appeler("travail", {})
            if travail:
                print("[agent] exécution", travail["id"], flush=True)
                code, sortie = executer(travail)
                appeler("resultat", {"id": travail["id"], "code": code, "sortie": sortie[-SORTIE_MAX:]})
                continue  # peut-être un autre job en attente
        except Exception as e:
            print("[agent]", e, file=sys.stderr, flush=True)
        if os.environ.get("AGENT_UNE_FOIS"):
            return
        time.sleep(PAUSE)


if __name__ == "__main__":
    main()
