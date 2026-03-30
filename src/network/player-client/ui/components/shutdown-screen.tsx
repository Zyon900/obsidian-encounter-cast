interface ShutdownScreenProps {
	supportUrl: string | null;
}

export function ShutdownScreen({ supportUrl }: ShutdownScreenProps) {
	return (
		<div className="shutdown-screen">
			<div className="shutdown-card">
				<h2>Thanks for playing!</h2>
				<p>
					If you enjoyed this plugin, consider supporting the author:
					{supportUrl ? (
						<>
							{" "}
							<a href={supportUrl} target="_blank" rel="noopener noreferrer">Buy him a coffee!</a>
						</>
					) : (
						" Buy him a coffee!"
					)}
				</p>
			</div>
		</div>
	);
}
