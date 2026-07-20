import { Component } from "react";

/**
 * Empêche un crash React d'afficher une page entièrement blanche.
 * Affiche un message actionnable et permet de réessayer.
 */
export class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur d'affichage de la vue:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-rose-600">Erreur d'affichage</p>
          <h2 className="mt-2 text-xl font-black">Cette page n'a pas pu s'afficher</h2>
          <p className="mt-2 text-sm font-medium text-rose-800">
            {this.state.error?.message || "Une erreur inattendue s'est produite."}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
            onClick={() => this.setState({ error: null })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
