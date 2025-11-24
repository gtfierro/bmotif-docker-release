import logging
import flask
from flask import Blueprint, current_app, jsonify, request
from flask_api import status

logger = logging.getLogger(__name__)
blueprint = Blueprint("home", __name__)
