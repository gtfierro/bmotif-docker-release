import { Component, Input, OnInit, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import * as vis from 'vis-network/standalone/umd/vis-network.min';
import * as $rdf from 'rdflib';

@Component({
  selector: 'app-model-network',
  templateUrl: './model-network.component.html',
  styleUrls: ['./model-network.component.css']
})
export class ModelNetworkComponent implements OnInit, AfterViewInit {
  @Input() modelId: number | undefined;
  @Input() turtleData: string | undefined;
  @Input() useClassNetwork: boolean = false;
  private API_URL = environment.API_URL;
  private store: $rdf.Store = $rdf.graph();
  private turtleString: string | undefined;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.modelId) {
      this.fetchTurtleFile();
    } else if (this.turtleData) {
      this.turtleString = this.turtleData;
    }

    // turtle data should be loaded by now, or provided as input
    if (this.turtleString) {
      this.buildNetwork();
    }
  }

  ngAfterViewInit(): void {
    if (this.turtleString) {
      this.buildNetwork();
    }
  }

  buildNetwork(): void {
    if (!this.turtleString) {
      return;
    }
    const contentType = 'text/turtle';
    this.store = $rdf.graph();
    $rdf.parse(this.turtleString, this.store, 'http://example.org/', contentType);
    if (this.useClassNetwork) {
      this.createClassNetwork(this.turtleString);
    } else {
      this.createNetwork(this.turtleString);
    }
  }

  fetchTurtleFile(): void {
    if (this.modelId) {
      this.http.get(`${this.API_URL}/models/${this.modelId}/graph`, { responseType: 'text' })
        .subscribe(turtleData => {
          // load turtle data into store
          this.turtleString = turtleData;
        this.buildNetwork();
        }, error => {
          console.error('Error fetching turtle file:', error);
        });
    }
  }

  private generateNetworkData(turtleData: string, getType: (uri: string) => string): { nodes: vis.DataSet<vis.Node>, edges: vis.Edge[] } {
    function value(uri: string): string {
      return uri.split(/[#/]/).pop() || '';
    }

    const nodes_set = new Set<string>();
    const edges_set = new Map<string, vis.Edge>();
    const node_id_lookup: { [key: string]: number } = {};
    for (const s in this.store.statements) {
      const statement = this.store.statements[s];
      // skip if object or subject is not a URI
      if (statement.subject.termType !== 'NamedNode' || statement.object.termType !== 'NamedNode') {
        continue;
      }
      const subject = getType(statement.subject.value);
      const object = getType(statement.object.value);
      if (subject === 'Unknown' || object === 'Unknown') {
        continue;
      }
      if (!nodes_set.has(subject)) {
        nodes_set.add(subject);
        node_id_lookup[subject] = nodes_set.size - 1;
      }
      if (!nodes_set.has(object)) {
        nodes_set.add(object);
        node_id_lookup[object] = nodes_set.size - 1;
      }
      const edge_key = `${node_id_lookup[subject]}-${node_id_lookup[object]}-${value(statement.predicate.value)}`;
      edges_set.set(edge_key, { from: node_id_lookup[subject], to: node_id_lookup[object], label: value(statement.predicate.value) });
    }
    const nodes_list: vis.Node[] = Array.from(nodes_set).map((label) => ({ id: node_id_lookup[label], label: label }));
    const nodes = new vis.DataSet(nodes_list);
    const edges: vis.Edge[] = Array.from(edges_set.values());
    return { nodes, edges };
  }

  createNetwork(turtleData: string): void {
    const { nodes, edges } = this.generateNetworkData(turtleData, uri => uri.split(/[#/]/).pop() || '');
    const container = document.getElementById('network');
    const data = { nodes, edges };
    const options = {
      layout: {
        improvedLayout: false,
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 1, type: 'arrow' },
        },
      },
    };

    if (container) {
      new vis.Network(container, data, options);
    }
  }

  createClassNetwork(turtleData: string): void {
    function value(uri: string): string {
      return uri.split(/[#/]/).pop() || '';
    }
    const { nodes, edges } = this.generateNetworkData(turtleData, uri => {
      const type = this.store.each($rdf.sym(uri), $rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), undefined);
      return type.length ? value(type[0].value) : 'Unknown';
    });
    const container = document.getElementById('network');
    const data = { nodes, edges };
    const options = {
      layout: {
        improvedLayout: false,
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 1, type: 'arrow' },
        },
      },
    };

    if (container) {
      new vis.Network(container, data, options);
    }
  }

}
