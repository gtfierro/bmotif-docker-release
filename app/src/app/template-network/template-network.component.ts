import { Component, Input, OnInit, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import * as vis from 'vis-network/standalone/umd/vis-network.min';
import * as $rdf from 'rdflib';

@Component({
  selector: 'app-template-network',
  templateUrl: './template-network.component.html',
  // styleUrls: ['./template-network.component.css']
})
export class TemplateNetworkComponent implements OnInit, AfterViewInit {
  @Input() templateId: number | undefined;
  @Input() turtleData: string | undefined;
  @Input() useClassNetwork: boolean = false;
  private API_URL = environment.API_URL;
  private store: $rdf.Store = $rdf.graph();
  private turtleString: string | undefined;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.templateId) {
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
    if (this.templateId) {
      this.http.get(`${this.API_URL}/templates/${this.templateId}/body`, { responseType: 'text' })
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
    const PARAM_PREFIX = 'urn:___param___';
    const localName = (uri: string): string => {
      if (uri.startsWith(PARAM_PREFIX)) {
        return uri.substring(PARAM_PREFIX.length);
      }
      const parts = uri.split(/[#/]/);
      return parts.length ? parts[parts.length - 1] : uri;
    };
    const value = (uri: string): string => localName(uri);

    const nodes_set = new Set<string>();
    const edges_set = new Map<string, vis.Edge>();
    const paramLabels = new Set<string>();
    const node_id_lookup: { [key: string]: number } = {};

    for (const s in this.store.statements) {
      const statement = this.store.statements[s];
      // Only handle triples with URI subject and object
      if (statement.subject.termType !== 'NamedNode' || statement.object.termType !== 'NamedNode') {
        continue;
      }

      // Derive display labels; if getType yields 'Unknown', fall back to localName so we don't drop edges
      let subjectLabel = getType(statement.subject.value);
      if (subjectLabel === 'Unknown' || !subjectLabel) {
        subjectLabel = localName(statement.subject.value);
      }
      let objectLabel = getType(statement.object.value);
      if (objectLabel === 'Unknown' || !objectLabel) {
        objectLabel = localName(statement.object.value);
      }

      if (!subjectLabel || !objectLabel) {
        continue;
      }

      // Track parameter nodes (both subject and object)
      if (statement.subject.value.startsWith(PARAM_PREFIX)) {
        paramLabels.add(subjectLabel);
      }
      if (statement.object.value.startsWith(PARAM_PREFIX)) {
        paramLabels.add(objectLabel);
      }

      // Ensure nodes exist
      if (!nodes_set.has(subjectLabel)) {
        nodes_set.add(subjectLabel);
        node_id_lookup[subjectLabel] = nodes_set.size - 1;
      }
      if (!nodes_set.has(objectLabel)) {
        nodes_set.add(objectLabel);
        node_id_lookup[objectLabel] = nodes_set.size - 1;
      }

      // Add/dedupe edge
      const edge_key = `${node_id_lookup[subjectLabel]}-${node_id_lookup[objectLabel]}-${value(statement.predicate.value)}`;
      edges_set.set(edge_key, {
        from: node_id_lookup[subjectLabel],
        to: node_id_lookup[objectLabel],
        label: value(statement.predicate.value)
      });
    }

    // Build nodes and color parameters distinctly
    const nodes_list: vis.Node[] = Array.from(nodes_set).map((label) => {
      const node: vis.Node = { id: node_id_lookup[label], label: label };
      if (paramLabels.has(label)) {
        node.color = { background: 'lightcoral', border: 'black' };
      } else {
        node.color = { background: 'lightblue', border: 'black' };
      }
      return node;
    });

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

